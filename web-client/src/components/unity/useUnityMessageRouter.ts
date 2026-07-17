import { useCallback, useEffect, useRef } from "react";
import type { BridgeApi } from "./useUnityBridge";

const UNITY_EVENT = "UnityMessage";

export type UnityMessageHandler = (type: string, data: any) => void;

export type UnityMessageRouter = {
  registerBridge: (bridge: BridgeApi) => void;
  onMessage: (handler: UnityMessageHandler) => () => void;
};

/**
 * Single owner of bridge.addEventListener("UnityMessage", ...).
 * Fans out parsed messages to all subscribed handlers.
 *
 * Why: react-unity-webgl dispatchEvent uses .find() and only invokes the
 * first listener for a given eventName — two hooks cannot each register
 * their own UnityMessage listener.
 */
export function useUnityMessageRouter(): UnityMessageRouter {
  const bridgeRef = useRef<BridgeApi | null>(null);
  const listenerRef = useRef<((...args: any[]) => void) | null>(null);
  const handlersRef = useRef<Set<UnityMessageHandler>>(new Set());

  const detachListener = useCallback(() => {
    const bridge = bridgeRef.current;
    const listener = listenerRef.current;
    if (bridge && listener) {
      bridge.removeEventListener(UNITY_EVENT, listener);
    }
    listenerRef.current = null;
  }, []);

  const handleRaw = useCallback((...args: any[]) => {
    const raw = args[0];
    if (typeof raw !== "string") return;

    let parsed: { type?: unknown; data?: unknown; payload?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof parsed.type !== "string") return;

    const data = parsed.data ?? parsed.payload;
    for (const handler of handlersRef.current) {
      handler(parsed.type, data);
    }
  }, []);

  const onMessage = useCallback((handler: UnityMessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const registerBridge = useCallback(
    (bridge: BridgeApi) => {
      detachListener();
      bridgeRef.current = bridge;
      listenerRef.current = handleRaw;
      bridge.addEventListener(UNITY_EVENT, handleRaw);
    },
    [detachListener, handleRaw]
  );

  useEffect(() => {
    return () => {
      detachListener();
      bridgeRef.current = null;
    };
  }, [detachListener]);

  return { registerBridge, onMessage };
}
