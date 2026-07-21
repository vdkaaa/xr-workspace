import { useCallback, useEffect, useRef, useState } from "react";
import type { UnityMessageRouter } from "./useUnityMessageRouter";

const BRIDGE_GAME_OBJECT = "BridgeManager";
const BRIDGE_METHOD = "OnReactMessage";

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
 *
 * Incoming UnityMessage traffic is owned by useUnityMessageRouter — this
 * hook only subscribes via messageRouter.onMessage and never calls
 * bridge.addEventListener itself.
 */
export function useUnityBridge(params: {
  jwt: string | null;
  roomId: string | null;
  userId: string | null;
  messageRouter: UnityMessageRouter;
}): {
  status: UnityBridgeStatus;
  errorMessage: string | null;
  registerBridge: (bridge: BridgeApi) => void;
  changeRoom: (roomId: string) => void;
  logout: () => void;
} {
  const { jwt, roomId, userId, messageRouter } = params;

  const [status, setStatus] = useState<UnityBridgeStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** True after Unity → React { type: "READY" }. */
  const [hasUnityReady, setHasUnityReady] = useState(false);

  const bridgeRef = useRef<BridgeApi | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const initSentRef = useRef(false);

  useEffect(() => {
    return messageRouter.onMessage((type, payload) => {
      if (type === "READY") {
        // BridgeManager is alive — safe to auth on the next INIT effect.
        initSentRef.current = false;
        setHasUnityReady(true);
        setErrorMessage(null);
        setStatus("authenticating");
        return;
      }

      if (type === "OK") {
        setErrorMessage(null);
        setStatus("ready");
        return;
      }

      if (type === "ERROR") {
        initSentRef.current = false;
        setStatus("error");
        setErrorMessage(payload?.message ?? "Unity bridge error");
      }
    });
  }, [messageRouter]);

  // Local side effects only — does NOT addEventListener("UnityMessage").
  const registerBridge = useCallback((bridge: BridgeApi) => {
    bridgeRef.current = bridge;
    initSentRef.current = false;
    setHasUnityReady(false);
    setErrorMessage(null);
    setStatus("waiting-ready");
  }, []);

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
      bridgeRef.current = null;
    };
  }, []);

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
