import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomStore } from "../../stores/roomStore";

/**
 * Presence / avatar relay over the backend WS bridge.
 *
 * Why we do NOT call /join here: `useRoomStore.joinRoom` already runs from
 * RoomDetail (and stores `roomToken`). Calling it again would duplicate the
 * backend request. This hook only waits for that token.
 *
 * Why we only reply JOIN once per peer session: without a Set of answered
 * keys, mutual JOIN replies loop forever (A→B, B→A, A→B…). Keys are
 * `${from}:${sessionId}` when present so a reconnect (new sessionId) gets a
 * fresh reply, while the same session still stops at 2 hops.
 */

export type RoomSocketStatus =
  | "idle"
  | "waiting-room-token"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type PeerState = {
  userId: string;
  displayName: string;
  position: Vec3;
  rotation: Quat;
  lastSeenAt: number;
};

type RoomEnvelope = {
  type: string;
  from: string;
  ts: number;
  data: any;
};

const BACKOFF_MS = [2000, 4000, 8000] as const;
const MAX_FAILURES = 5;
/** ~80ms tick ≈ 12.5 Hz ceiling; keeps throttle + keep-alive on one timer. */
const SYNC_TICK_MS = 80;
/** Resend last transform if nothing changed, so peers know we are still alive. */
const KEEP_ALIVE_MS = 1000;
/**
 * Local-only stale peer eviction. Backend does not guarantee a LEAVE on
 * disconnect (see protocolo-multiplayer-ws.md); we drop peers after 8s silence.
 */
const PEER_TIMEOUT_MS = 8000;

const DEFAULT_POSITION: Vec3 = { x: 0, y: 0, z: 0 };
const DEFAULT_ROTATION: Quat = { x: 0, y: 0, z: 0, w: 1 };

function transformsEqual(
  a: { position: Vec3; rotation: Quat },
  b: { position: Vec3; rotation: Quat }
): boolean {
  return (
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.position.z === b.position.z &&
    a.rotation.x === b.rotation.x &&
    a.rotation.y === b.rotation.y &&
    a.rotation.z === b.rotation.z &&
    a.rotation.w === b.rotation.w
  );
}

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
  peers: Record<string, PeerState>;
  updatePosition: (position: Vec3, rotation: Quat) => void;
  send: (envelope: { type: string; data: any }) => void;
  errorMessage: string | null;
} {
  const { roomId, userId, displayName, enabled } = params;
  const roomToken = useRoomStore((s) => s.roomToken);

  const [status, setStatus] = useState<RoomSocketStatus>("idle");
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<RoomSocketStatus>("idle");
  const answeredJoinsRef = useRef<Set<string>>(new Set());
  // Regenerated in connect() so each socket session (incl. reconnect) has a new id.
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const failCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  // Latest transform requested by the app; sync tick decides when to send.
  const latestLocalTransformRef = useRef<{
    position: Vec3;
    rotation: Quat;
  }>({ position: { ...DEFAULT_POSITION }, rotation: { ...DEFAULT_ROTATION } });
  const lastSentTransformRef = useRef<{
    position: Vec3;
    rotation: Quat;
  } | null>(null);
  const lastSentAtRef = useRef(0);

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
    const { position, rotation } = latestLocalTransformRef.current;
    return {
      type: "JOIN",
      from: userIdRef.current!,
      ts: Date.now(),
      data: {
        displayName: displayNameRef.current,
        sessionId: sessionIdRef.current,
        position: { ...position },
        rotation: { ...rotation },
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

  const updatePosition = useCallback((position: Vec3, rotation: Quat) => {
    latestLocalTransformRef.current = {
      position: { ...position },
      rotation: { ...rotation },
    };
  }, []);

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

        const data = envelope.data ?? {};
        const displayName =
          typeof data.displayName === "string" && data.displayName
            ? data.displayName
            : from;
        const position: Vec3 =
          data.position &&
          typeof data.position.x === "number" &&
          typeof data.position.y === "number" &&
          typeof data.position.z === "number"
            ? {
                x: data.position.x,
                y: data.position.y,
                z: data.position.z,
              }
            : { ...DEFAULT_POSITION };
        const rotation: Quat =
          data.rotation &&
          typeof data.rotation.x === "number" &&
          typeof data.rotation.y === "number" &&
          typeof data.rotation.z === "number" &&
          typeof data.rotation.w === "number"
            ? {
                x: data.rotation.x,
                y: data.rotation.y,
                z: data.rotation.z,
                w: data.rotation.w,
              }
            : { ...DEFAULT_ROTATION };

        setPeers((prev) => ({
          ...prev,
          [from]: {
            userId: from,
            displayName,
            position,
            rotation,
            lastSeenAt: Date.now(),
          },
        }));

        // Key by from+sessionId so a reconnect (new sessionId) gets a reply;
        // same session still answers only once (2-hop handshake).
        const incomingSessionId =
          typeof data.sessionId === "string" && data.sessionId
            ? data.sessionId
            : null;
        const answerKey = incomingSessionId
          ? `${from}:${incomingSessionId}`
          : from;

        if (!answeredJoinsRef.current.has(answerKey)) {
          answeredJoinsRef.current.add(answerKey);
          sendRaw(buildJoinEnvelope());
        }
        return;
      }

      if (type === "AVATAR_UPDATE") {
        const from = envelope.from;
        if (typeof from !== "string" || !from) return;
        if (from === userIdRef.current) return;

        setPeers((prev) => {
          const existing = prev[from];
          if (!existing) {
            console.warn(
              "[useRoomSocket] AVATAR_UPDATE from unknown peer (no JOIN yet):",
              from
            );
            return prev;
          }

          const data = envelope.data ?? {};
          const position: Vec3 =
            data.position &&
            typeof data.position.x === "number" &&
            typeof data.position.y === "number" &&
            typeof data.position.z === "number"
              ? {
                  x: data.position.x,
                  y: data.position.y,
                  z: data.position.z,
                }
              : existing.position;
          const rotation: Quat =
            data.rotation &&
            typeof data.rotation.x === "number" &&
            typeof data.rotation.y === "number" &&
            typeof data.rotation.z === "number" &&
            typeof data.rotation.w === "number"
              ? {
                  x: data.rotation.x,
                  y: data.rotation.y,
                  z: data.rotation.z,
                  w: data.rotation.w,
                }
              : existing.rotation;

          return {
            ...prev,
            [from]: {
              ...existing,
              position,
              rotation,
              lastSeenAt: Date.now(),
            },
          };
        });
        return;
      }

      if (type === "LEAVE") {
        const from = envelope.from;
        if (typeof from !== "string" || !from) return;

        setPeers((prev) => {
          if (!(from in prev)) return prev;
          const next = { ...prev };
          delete next[from];
          return next;
        });
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
      lastSentTransformRef.current = null;
      lastSentAtRef.current = 0;
      setPeers({});
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

      sessionIdRef.current = crypto.randomUUID();
      answeredJoinsRef.current.clear();
      lastSentTransformRef.current = null;
      lastSentAtRef.current = 0;
      setPeers({});
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

    // One interval for outbound throttle+keep-alive AND local peer timeout —
    // avoids two timers racing / duplicating work every frame.
    const syncIntervalId = setInterval(() => {
      const now = Date.now();

      // Evict peers that went silent (local LEAVE; backend may never send one).
      setPeers((prev) => {
        let changed = false;
        const next: Record<string, PeerState> = {};
        for (const [id, peer] of Object.entries(prev)) {
          if (now - peer.lastSeenAt > PEER_TIMEOUT_MS) {
            changed = true;
            continue;
          }
          next[id] = peer;
        }
        return changed ? next : prev;
      });

      if (statusRef.current !== "connected") return;

      const uid = userIdRef.current;
      if (!uid) return;

      const latest = latestLocalTransformRef.current;
      const lastSent = lastSentTransformRef.current;
      const changed = !lastSent || !transformsEqual(latest, lastSent);
      const keepAliveDue =
        lastSentAtRef.current > 0 &&
        now - lastSentAtRef.current >= KEEP_ALIVE_MS;

      // First tick after connect: send even if caller never called updatePosition
      // (defaults 0,0,0 / identity) so peers get a baseline keep-alive stream.
      const shouldSend =
        changed || keepAliveDue || lastSentAtRef.current === 0;

      if (!shouldSend) return;

      sendRaw({
        type: "AVATAR_UPDATE",
        from: uid,
        ts: now,
        data: {
          position: { ...latest.position },
          rotation: { ...latest.rotation },
        },
      });
      lastSentTransformRef.current = {
        position: { ...latest.position },
        rotation: { ...latest.rotation },
      };
      lastSentAtRef.current = now;
    }, SYNC_TICK_MS);

    return () => {
      cancelled = true;
      intentionalCloseRef.current = true;
      clearInterval(syncIntervalId);
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
    peers,
    updatePosition,
    send,
    errorMessage,
  };
}
