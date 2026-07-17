import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomStore } from "../../stores/roomStore";

/**
 * Presence / avatar relay over the backend WS bridge.
 *
 * Why we do NOT call /join here: `useRoomStore.joinRoom` already runs from
 * RoomDetail (and stores `roomToken`). Calling it again would duplicate the
 * backend request. This hook only waits for that token.
 *
 * Why we only reply JOIN once per peer: without a Set of answered peers,
 * mutual JOIN replies loop forever (A→B, B→A, A→B…).
 */

export type RoomSocketStatus =
  | "idle"
  | "waiting-room-token"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

type RoomEnvelope = {
  type: string;
  from: string;
  ts: number;
  data: any;
};

const BACKOFF_MS = [2000, 4000, 8000] as const;
const MAX_FAILURES = 5;

function toWsBaseUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/i, "ws").replace(/\/$/, "");
}

export function useRoomSocket(params: {
  roomId: string | null;
  userId: string | null;
  displayName: string;
  enabled: boolean;
}): {
  status: RoomSocketStatus;
  knownPeers: string[];
  send: (envelope: { type: string; data: any }) => void;
  errorMessage: string | null;
} {
  const { roomId, userId, displayName, enabled } = params;
  const roomToken = useRoomStore((s) => s.roomToken);

  const [status, setStatus] = useState<RoomSocketStatus>("idle");
  const [knownPeers, setKnownPeers] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<RoomSocketStatus>("idle");
  const answeredJoinsRef = useRef<Set<string>>(new Set());
  const failCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  // Keep latest values for handlers / cleanup without re-subscribing mid-flight
  const userIdRef = useRef(userId);
  const displayNameRef = useRef(displayName);
  const roomIdRef = useRef(roomId);
  const roomTokenRef = useRef(roomToken);

  userIdRef.current = userId;
  displayNameRef.current = displayName;
  roomIdRef.current = roomId;
  roomTokenRef.current = roomToken;
  statusRef.current = status;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const buildJoinEnvelope = useCallback((): RoomEnvelope => {
    return {
      type: "JOIN",
      from: userIdRef.current!,
      ts: Date.now(),
      data: {
        displayName: displayNameRef.current,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    };
  }, []);

  const sendRaw = useCallback((envelope: RoomEnvelope) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(envelope));
  }, []);

  const send = useCallback(
    (envelope: { type: string; data: any }) => {
      if (statusRef.current !== "connected") return;
      const uid = userIdRef.current;
      if (!uid) return;
      sendRaw({
        ...envelope,
        from: uid,
        ts: Date.now(),
      });
    },
    [sendRaw]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let envelope: Partial<RoomEnvelope>;
      try {
        envelope = JSON.parse(String(event.data));
      } catch {
        return;
      }

      const type = envelope.type;
      if (typeof type !== "string") return;

      // Server CONNECTED and any unknown app types: ignore / log, not an error
      if (type === "CONNECTED") return;

      if (type === "JOIN") {
        const from = envelope.from;
        if (typeof from !== "string" || !from) return;
        if (from === userIdRef.current) return;

        setKnownPeers((prev) =>
          prev.includes(from) ? prev : [...prev, from]
        );

        // Reply with our JOIN only once per peer — avoids an infinite reply loop
        if (!answeredJoinsRef.current.has(from)) {
          answeredJoinsRef.current.add(from);
          sendRaw(buildJoinEnvelope());
        }
        return;
      }

      if (type === "AVATAR_UPDATE" || type === "LEAVE") {
        console.log("[useRoomSocket] recibido:", envelope);
        return;
      }

      // Unrecognized type — ignore silently (e.g. future / server messages)
    },
    [buildJoinEnvelope, sendRaw]
  );

  useEffect(() => {
    if (!enabled || !roomId || !userId) {
      intentionalCloseRef.current = true;
      clearReconnectTimer();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(
            JSON.stringify({
              type: "LEAVE",
              from: userIdRef.current,
              ts: Date.now(),
              data: {},
            })
          );
        } catch {
          // ignore send failures during teardown
        }
      }
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
      answeredJoinsRef.current.clear();
      failCountRef.current = 0;
      setKnownPeers([]);
      setErrorMessage(null);
      setStatus("idle");
      return;
    }

    if (!roomToken) {
      setStatus("waiting-room-token");
      return;
    }

    intentionalCloseRef.current = false;
    failCountRef.current = 0;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      clearReconnectTimer();

      // Close any prior socket before opening a new one
      const prev = wsRef.current;
      if (prev) {
        intentionalCloseRef.current = true;
        prev.close();
        wsRef.current = null;
        intentionalCloseRef.current = false;
      }

      answeredJoinsRef.current.clear();
      setKnownPeers([]);
      setErrorMessage(null);

      const token = roomTokenRef.current;
      const rid = roomIdRef.current;
      const uid = userIdRef.current;
      if (!token || !rid || !uid) {
        setStatus("waiting-room-token");
        return;
      }

      const apiUrl =
        import.meta.env.VITE_API_URL || "http://localhost:3000";
      const wsBaseUrl = toWsBaseUrl(apiUrl);
      const url = `${wsBaseUrl}/?token=${encodeURIComponent(token)}&room_id=${encodeURIComponent(rid)}&user_id=${encodeURIComponent(uid)}`;

      setStatus(
        failCountRef.current > 0 ? "reconnecting" : "connecting"
      );

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled || wsRef.current !== ws) return;
        failCountRef.current = 0;
        setStatus("connected");
        setErrorMessage(null);
        sendRaw(buildJoinEnvelope());
      };

      ws.onmessage = (event) => {
        if (cancelled || wsRef.current !== ws) return;
        handleMessage(event);
      };

      ws.onerror = () => {
        // Browser fires onerror then onclose; let onclose drive reconnect
      };

      ws.onclose = () => {
        if (cancelled || wsRef.current !== ws) return;
        wsRef.current = null;

        if (intentionalCloseRef.current) return;

        const wasConnected = statusRef.current === "connected";
        failCountRef.current += 1;

        if (failCountRef.current >= MAX_FAILURES) {
          setStatus("error");
          setErrorMessage("WebSocket: demasiados fallos de reconexión");
          return;
        }

        if (
          wasConnected ||
          statusRef.current === "connecting" ||
          statusRef.current === "reconnecting"
        ) {
          setStatus("reconnecting");
          const delay =
            BACKOFF_MS[
              Math.min(failCountRef.current - 1, BACKOFF_MS.length - 1)
            ];
          reconnectTimerRef.current = setTimeout(() => {
            // Re-read roomToken from store in case it changed
            roomTokenRef.current = useRoomStore.getState().roomToken;
            connect();
          }, delay);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      intentionalCloseRef.current = true;
      clearReconnectTimer();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && userIdRef.current) {
        try {
          ws.send(
            JSON.stringify({
              type: "LEAVE",
              from: userIdRef.current,
              ts: Date.now(),
              data: {},
            })
          );
        } catch {
          // ignore
        }
      }
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
      answeredJoinsRef.current.clear();
    };
  }, [
    enabled,
    roomId,
    userId,
    roomToken,
    buildJoinEnvelope,
    clearReconnectTimer,
    handleMessage,
    sendRaw,
  ]);

  return {
    status,
    knownPeers,
    send,
    errorMessage,
  };
}
