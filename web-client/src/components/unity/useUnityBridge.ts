import { useCallback, useEffect, useRef, useState } from "react";

const BRIDGE_GAME_OBJECT = "BridgeManager";
const BRIDGE_METHOD = "OnReactMessage";
const UNITY_EVENT = "UnityMessage";

export type BridgeApi = {
  sendMessage: (
    gameObjectName: string,
    methodName: string,
    payload: string
  ) => void;
  addEventListener: (
    event: string,
    callback: (...args: any[]) => void
  ) => void;
  removeEventListener: (
    event: string,
    callback: (...args: any[]) => void
  ) => void;
};

export type UnityBridgeStatus =
  | "idle"
  | "waiting-ready"
  | "authenticating"
  | "ready"
  | "error";

type ReactToUnityMessage =
  | {
      type: "INIT";
      payload: { jwt: string; roomId: string; userId: string };
    }
  | { type: "CHANGE_ROOM"; payload: { roomId: string } }
  | { type: "LOGOUT" };

type UnityToReactMessage =
  | { type: "READY" }
  | { type: "OK"; payload?: any }
  | { type: "ERROR"; payload: { message: string } };

function sendToUnity(bridge: BridgeApi, msg: ReactToUnityMessage) {
  bridge.sendMessage(
    BRIDGE_GAME_OBJECT,
    BRIDGE_METHOD,
    JSON.stringify(msg)
  );
}

/**
 * Handshake with Unity's BridgeManager.
 *
 * Why wait for READY before INIT: `onBridgeReady` only means the WebGL
 * runtime can accept SendMessage. BridgeManager may not exist yet in the
 * scene graph — sending INIT earlier is a silent no-op / lost auth.
 * Unity emits READY once the GameObject is live; only then is INIT safe.
 */
export function useUnityBridge(params: {
  jwt: string | null;
  roomId: string | null;
  userId: string | null;
}): {
  status: UnityBridgeStatus;
  errorMessage: string | null;
  registerBridge: (bridge: BridgeApi) => void;
  changeRoom: (roomId: string) => void;
  logout: () => void;
} {
  const { jwt, roomId, userId } = params;

  const [status, setStatus] = useState<UnityBridgeStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** True after Unity → React { type: "READY" }. */
  const [hasUnityReady, setHasUnityReady] = useState(false);

  const bridgeRef = useRef<BridgeApi | null>(null);
  const listenerRef = useRef<((...args: any[]) => void) | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const initSentRef = useRef(false);

  const detachListener = useCallback(() => {
    const bridge = bridgeRef.current;
    const listener = listenerRef.current;
    if (bridge && listener) {
      bridge.removeEventListener(UNITY_EVENT, listener);
    }
    listenerRef.current = null;
  }, []);

  const handleUnityMessage = useCallback((...args: any[]) => {
    const raw = args[0];
    if (typeof raw !== "string") return;

    let msg: UnityToReactMessage;
    try {
      msg = JSON.parse(raw) as UnityToReactMessage;
    } catch {
      return;
    }

    if (msg.type === "READY") {
      // BridgeManager is alive — safe to auth on the next INIT effect.
      initSentRef.current = false;
      setHasUnityReady(true);
      setErrorMessage(null);
      setStatus("authenticating");
      return;
    }

    if (msg.type === "OK") {
      setErrorMessage(null);
      setStatus("ready");
      return;
    }

    if (msg.type === "ERROR") {
      initSentRef.current = false;
      setStatus("error");
      setErrorMessage(msg.payload?.message ?? "Unity bridge error");
    }
  }, []);

  const registerBridge = useCallback(
    (bridge: BridgeApi) => {
      detachListener();
      bridgeRef.current = bridge;
      listenerRef.current = handleUnityMessage;
      bridge.addEventListener(UNITY_EVENT, handleUnityMessage);
      initSentRef.current = false;
      setHasUnityReady(false);
      setErrorMessage(null);
      setStatus("waiting-ready");
    },
    [detachListener, handleUnityMessage]
  );

  // Send INIT once we have both READY and session credentials.
  useEffect(() => {
    if (!hasUnityReady || initSentRef.current) return;
    if (!jwt || !roomId || !userId) return;

    const bridge = bridgeRef.current;
    if (!bridge) return;

    initSentRef.current = true;
    setStatus("authenticating");
    sendToUnity(bridge, {
      type: "INIT",
      payload: { jwt, roomId, userId },
    });
  }, [hasUnityReady, jwt, roomId, userId]);

  useEffect(() => {
    return () => {
      detachListener();
      bridgeRef.current = null;
    };
  }, [detachListener]);

  const changeRoom = useCallback((nextRoomId: string) => {
    if (statusRef.current !== "ready") return;
    const bridge = bridgeRef.current;
    if (!bridge) return;
    sendToUnity(bridge, {
      type: "CHANGE_ROOM",
      payload: { roomId: nextRoomId },
    });
  }, []);

  const logout = useCallback(() => {
    const bridge = bridgeRef.current;
    if (bridge) {
      sendToUnity(bridge, { type: "LOGOUT" });
    }
    initSentRef.current = false;
    setHasUnityReady(false);
    setErrorMessage(null);
    setStatus("idle");
  }, []);

  return {
    status,
    errorMessage,
    registerBridge,
    changeRoom,
    logout,
  };
}
