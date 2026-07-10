import { useEffect, useRef, useState } from "react";
import type { UnityInstance } from "react-unity-webgl";
import { WebXRBridge, type SendMessageFn } from "./WebXRBridge";

type UnityEventParameter = string | number | boolean | undefined | void;
type UnityEventListener = (...parameters: UnityEventParameter[]) => UnityEventParameter;

export interface UseWebXRBridgeOptions {
  isLoaded: boolean;
  sendMessage: SendMessageFn;
  addEventListener: (eventName: string, callback: UnityEventListener) => void;
  removeEventListener: (eventName: string, callback: UnityEventListener) => void;
  /** `UNSAFE__unityInstance` from `useUnityContext`. */
  unityInstance: UnityInstance | null;
  /** Must match the GameObject name configured in WebXRManager (default "WebXRCameraSet"). */
  gameObjectName?: string;
}

export interface UseWebXRBridgeResult {
  /** Whether the current browser/device reports immersive-vr support. */
  isVRSupported: boolean;
  /** Whether an immersive-vr session is currently active. */
  isInSession: boolean;
  /** Last `displayXRElementId` message id sent by Unity (e.g. "novr"), if any. */
  displayMessageId: string | null;
  /** Dismisses the current `displayMessageId` banner. */
  dismissDisplayMessage: () => void;
  /**
   * Debug: when true, VR session keeps Unity on CameraMain (no stereo).
   * Toggle before enterVR; takes effect on the next session start.
   */
  debugMonoMode: boolean;
  setDebugMonoMode: (enabled: boolean) => void;
  enterVR: () => Promise<void>;
  exitVR: () => void;
}

/**
 * React hook wiring the WebXR <-> Unity bridge into a component using
 * `useUnityContext` from `react-unity-webgl`. See UnityViewer.tsx for usage.
 */
export function useWebXRBridge(options: UseWebXRBridgeOptions): UseWebXRBridgeResult {
  const { isLoaded, sendMessage, addEventListener, removeEventListener, unityInstance, gameObjectName } = options;

  const [isVRSupported, setIsVRSupported] = useState(false);
  const [isInSession, setIsInSession] = useState(false);
  const [displayMessageId, setDisplayMessageId] = useState<string | null>(null);
  const [debugMonoMode, setDebugMonoModeState] = useState(false);

  const bridgeRef = useRef<WebXRBridge | null>(null);
  const unityInstanceRef = useRef<UnityInstance | null>(unityInstance);
  unityInstanceRef.current = unityInstance;

  // Bridge instance lives for the component's lifetime; recreated only if
  // the target GameObject name changes (should basically never happen).
  useEffect(() => {
    const bridge = new WebXRBridge({
      gameObjectName,
      sendMessage,
      getUnityInstance: () => unityInstanceRef.current,
      onImmersiveStateChange: setIsInSession,
    });
    bridgeRef.current = bridge;
    setDebugMonoModeState(bridge.isDebugMonoMode);

    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameObjectName]);

  // Attach the bridge as soon as the Unity instance exists (don't wait on
  // isLoaded — on Quest that flag can lag behind loadingProgression === 1).
  useEffect(() => {
    if (!unityInstance) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;

    let cancelled = false;
    bridge.checkSupport().then((supported) => {
      if (cancelled) return;
      setIsVRSupported(supported);
      bridge.attach();
    });

    return () => {
      cancelled = true;
    };
  }, [unityInstance]);

  // Unity -> React events dispatched from webxr.jslib via dispatchReactUnityEvent.
  useEffect(() => {
    const handleDisplayMessage: UnityEventListener = (id) => {
      if (typeof id !== "string") {
        setDisplayMessageId(null);
        return;
      }
      // Ack from WebXRManager.OnStartXR — proves SendMessage reached Unity.
      if (id === "xr-started") {
        console.info(
          "[WebXRBridge][diag] ACK Unity: OnStartXR recibido (displayXRElementId=xr-started)."
        );
        return;
      }
      setDisplayMessageId(id);
    };

    addEventListener("WebXRDisplayMessage", handleDisplayMessage);
    return () => removeEventListener("WebXRDisplayMessage", handleDisplayMessage);
  }, [addEventListener, removeEventListener]);

  return {
    isVRSupported,
    isInSession,
    displayMessageId,
    dismissDisplayMessage: () => setDisplayMessageId(null),
    debugMonoMode,
    setDebugMonoMode: (enabled: boolean) => {
      bridgeRef.current?.setDebugMonoMode(enabled);
      setDebugMonoModeState(enabled);
    },
    enterVR: () => bridgeRef.current?.enterVR() ?? Promise.resolve(),
    exitVR: () => bridgeRef.current?.exitVR(),
  };
}
