import { useCallback, useEffect, useRef } from "react";
import type { BridgeApi } from "./useUnityBridge";
import type { PeerState, Quat, Vec3 } from "./useRoomSocket";

const BRIDGE_GAME_OBJECT = "BridgeManager";
const BRIDGE_METHOD = "OnReactMessage";
const UNITY_EVENT = "UnityMessage";

type LocalTransformMessage = {
  type: "LOCAL_TRANSFORM";
  data: {
    position: Vec3;
    rotation: Quat;
  };
};

function isVec3(value: unknown): value is Vec3 {
  if (typeof value !== "object" || value === null) return false;

  const vector = value as Record<string, unknown>;
  return (
    typeof vector.x === "number" &&
    typeof vector.y === "number" &&
    typeof vector.z === "number"
  );
}

function isQuat(value: unknown): value is Quat {
  if (typeof value !== "object" || value === null) return false;

  const rotation = value as Record<string, unknown>;
  return (
    typeof rotation.x === "number" &&
    typeof rotation.y === "number" &&
    typeof rotation.z === "number" &&
    typeof rotation.w === "number"
  );
}

function isLocalTransformMessage(
  value: unknown
): value is LocalTransformMessage {
  if (typeof value !== "object" || value === null) return false;

  const message = value as {
    type?: unknown;
    data?: {
      position?: unknown;
      rotation?: unknown;
    };
  };

  return (
    message.type === "LOCAL_TRANSFORM" &&
    typeof message.data === "object" &&
    message.data !== null &&
    isVec3(message.data.position) &&
    isQuat(message.data.rotation)
  );
}

/**
 * Relays peer transforms between React and Unity.
 *
 * This hook has its own UnityMessage listener because each bridge hook filters
 * its own protocol: useUnityBridge handles READY/OK/ERROR, while this hook
 * handles LOCAL_TRANSFORM and neither needs to know the other's messages.
 */
export function useUnityPeerBridge(params: {
  peers: Record<string, PeerState>;
  updatePosition: (position: Vec3, rotation: Quat) => void;
}): {
  registerBridge: (bridge: BridgeApi) => void;
} {
  const { peers, updatePosition } = params;

  const bridgeRef = useRef<BridgeApi | null>(null);
  const listenerRef = useRef<((...args: any[]) => void) | null>(null);
  const prevPeersRef = useRef<Record<string, PeerState>>({});
  const peersRef = useRef<Record<string, PeerState>>({});
  const updatePositionRef = useRef(updatePosition);

  peersRef.current = peers;
  updatePositionRef.current = updatePosition;

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

    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (!isLocalTransformMessage(message)) return;

    updatePositionRef.current(
      message.data.position,
      message.data.rotation
    );
  }, []);

  const send = useCallback((type: string, data: object) => {
    const bridge = bridgeRef.current;
    if (!bridge) return;

    bridge.sendMessage(
      BRIDGE_GAME_OBJECT,
      BRIDGE_METHOD,
      JSON.stringify({ type, data })
    );
  }, []);

  // The WS connects before Unity finishes loading, so any peer already in the
  // room before the bridge registers would stay invisible in Unity forever: the
  // peers effect only detects joins/leaves/changes once someone is listening.
  // Replaying the current peers on registration bootstraps that missing state.
  const registerBridge = useCallback(
    (bridge: BridgeApi) => {
      detachListener();
      bridgeRef.current = bridge;
      listenerRef.current = handleUnityMessage;
      bridge.addEventListener(UNITY_EVENT, handleUnityMessage);

      for (const peer of Object.values(peersRef.current)) {
        bridge.sendMessage(
          BRIDGE_GAME_OBJECT,
          BRIDGE_METHOD,
          JSON.stringify({
            type: "PEER_JOIN",
            data: {
              userId: peer.userId,
              displayName: peer.displayName,
              position: peer.position,
              rotation: peer.rotation,
            },
          })
        );
      }

      // Mark these as already seen so the peers effect does not resend them.
      prevPeersRef.current = peersRef.current;
    },
    [detachListener, handleUnityMessage]
  );

  useEffect(() => {
    const previousPeers = prevPeersRef.current;

    if (bridgeRef.current) {
      for (const [id, peer] of Object.entries(peers)) {
        const previousPeer = previousPeers[id];

        if (!previousPeer) {
          send("PEER_JOIN", {
            userId: peer.userId,
            displayName: peer.displayName,
            position: peer.position,
            rotation: peer.rotation,
          });
        } else if (previousPeer !== peer) {
          send("PEER_UPDATE", {
            userId: peer.userId,
            position: peer.position,
            rotation: peer.rotation,
          });
        }
      }

      for (const id of Object.keys(previousPeers)) {
        if (!(id in peers)) {
          send("PEER_LEFT", { userId: id });
        }
      }
    }

    // Advance even without Unity to avoid replaying a PEER_JOIN backlog later.
    prevPeersRef.current = peers;
  }, [peers, send]);

  useEffect(() => {
    return () => {
      detachListener();
      bridgeRef.current = null;
    };
  }, [detachListener]);

  return { registerBridge };
}
