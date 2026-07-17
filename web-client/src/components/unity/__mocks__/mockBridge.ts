import type { BridgeApi } from "../useUnityBridge";

type UnityEventCallback = (...args: any[]) => void;

/**
 * Fake Unity BridgeManager for isolated useUnityBridge tests
 * (no WebGL build required).
 */
export function createMockBridge(): BridgeApi {
  const listeners = new Map<string, Set<UnityEventCallback>>();

  const emit = (event: string, payload: unknown) => {
    const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
    console.log("[MockBridge] emit", event, raw);
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of set) cb(raw);
  };

  const bridge: BridgeApi = {
    sendMessage(gameObjectName, methodName, payload) {
      console.log("[MockBridge] recv", { gameObjectName, methodName, payload });

      let msg: { type?: string } = {};
      try {
        msg = JSON.parse(payload) as { type?: string };
      } catch {
        console.log("[MockBridge] recv (non-JSON payload)", payload);
        return;
      }

      if (msg.type === "INIT") {
        window.setTimeout(() => {
          emit("UnityMessage", { type: "OK" });
        }, 500);
        return;
      }

      if (msg.type === "CHANGE_ROOM") {
        window.setTimeout(() => {
          emit("UnityMessage", { type: "OK" });
        }, 300);
      }
    },

    addEventListener(event, callback) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(callback);
    },

    removeEventListener(event, callback) {
      listeners.get(event)?.delete(callback);
    },
  };

  window.setTimeout(() => {
    emit("UnityMessage", { type: "READY" });
  }, 300);

  return bridge;
}
