import { useCallback, useEffect, useRef } from "react";
import type { BridgeApi } from "./useUnityBridge";
import type { UnityMessageRouter } from "./useUnityMessageRouter";
import type { PeerState, Quat, Vec3 } from "./useRoomSocket";

const BRIDGE_GAME_OBJECT = "BridgeManager";
const BRIDGE_METHOD = "OnReactMessage";

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

/**
 * Relays peer transforms between React and Unity.
 *
 * Incoming UnityMessage traffic is owned by useUnityMessageRouter — this
 * hook only subscribes via messageRouter.onMessage for LOCAL_TRANSFORM
 * and never calls bridge.addEventListener itself.
 */
export function useUnityPeerBridge(params: {
  peers: Record<string, PeerState>;
  updatePosition: (position: Vec3, rotation: Quat) => void;
  messageRouter: UnityMessageRouter;
}): {
  registerBridge: (bridge: BridgeApi) => void;
} {
  const { peers, updatePosition, messageRouter } = params;

  const bridgeRef = useRef<BridgeApi | null>(null);
  const prevPeersRef = useRef<Record<string, PeerState>>({});
  const peersRef = useRef<Record<string, PeerState>>({});
  const updatePositionRef = useRef(updatePosition);

  peersRef.current = peers;
  updatePositionRef.current = updatePosition;

  useEffect(() => {
    return messageRouter.onMessage((type, data) => {
      console.log(`[useUnityPeerBridge][DIAG] onMessage type=`, type, data);

      if (type !== "LOCAL_TRANSFORM") return;

      if (
        typeof data !== "object" ||
        data === null ||
        !isVec3(data.position) ||
        !isQuat(data.rotation)
      ) {
        console.log(
          `[useUnityPeerBridge][DIAG] no pasó validación LOCAL_TRANSFORM:`,
          data
        );
        return;
      }

      console.log(
        `[useUnityPeerBridge][DIAG] llamando updatePositionRef.current con`,
        data.position
      );
      updatePositionRef.current(data.position, data.rotation);
    });
  }, [messageRouter]);

  const send = useCallback((type: string, data: object) => {
    const bridge = bridgeRef.current;
    if (!bridge) return;

    const json = JSON.stringify({ type, data });
    console.log(`[useUnityPeerBridge][DIAG] JSON exacto enviado:`, json);
    bridge.sendMessage(BRIDGE_GAME_OBJECT, BRIDGE_METHOD, json);
  }, []);

  // Local side effects only — does NOT addEventListener("UnityMessage").
  // The WS connects before Unity finishes loading, so any peer already in the
  // room before the bridge registers would stay invisible in Unity forever: the
  // peers effect only detects joins/leaves/changes once someone is listening.
  // Replaying the current peers on registration bootstraps that missing state.
  const registerBridge = useCallback((bridge: BridgeApi) => {
    console.log("[useUnityPeerBridge][DIAG] registerBridge llamado");
    bridgeRef.current = bridge;

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
  }, []);

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
      console.log(
        "[useUnityPeerBridge][DIAG] CLEANUP — bridgeRef cleared"
      );
      bridgeRef.current = null;
    };
  }, []);

  return { registerBridge };
}
