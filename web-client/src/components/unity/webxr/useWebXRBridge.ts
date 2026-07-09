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

    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameObjectName]);

  // Attach once Unity has finished loading.
  useEffect(() => {
    if (!isLoaded) return;
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
  }, [isLoaded]);

  // Unity -> React events dispatched from webxr.jslib via dispatchReactUnityEvent.
  useEffect(() => {
    const handleDisplayMessage: UnityEventListener = (id) => {
      setDisplayMessageId(typeof id === "string" ? id : null);
    };

    addEventListener("WebXRDisplayMessage", handleDisplayMessage);
    return () => removeEventListener("WebXRDisplayMessage", handleDisplayMessage);
  }, [addEventListener, removeEventListener]);

  return {
    isVRSupported,
    isInSession,
    displayMessageId,
    dismissDisplayMessage: () => setDisplayMessageId(null),
    enterVR: () => bridgeRef.current?.enterVR() ?? Promise.resolve(),
    exitVR: () => bridgeRef.current?.exitVR(),
  };
}
