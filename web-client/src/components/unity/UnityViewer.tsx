import { useCallback, useEffect, useRef, useState } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";
import { useWebXRBridge } from "./webxr";
import "./UnityViewer.css";


declare global {
  interface Window {
    __XRRoomUnity?: {
      sendMessage: (gameObjectName: string, methodName: string, parameter?: string | number) => void;
      sendToBridgeManager: (methodName: string, parameter?: string | number) => void;
      getInstance: () => unknown;
    };
  }
}


const UNITY_BUILD_ROOT = "/unity-build";
const UNITY_BUILD_BASE = `${UNITY_BUILD_ROOT}/Build`;
const WEBXR_GAME_OBJECT_NAME = "WebXRCameraSet";

const UNITY_CONFIG = {
  loaderUrl: `${UNITY_BUILD_BASE}/XR-Rooms.loader.js`,
  dataUrl: `${UNITY_BUILD_BASE}/XR-Rooms.data.br`,
  frameworkUrl: `${UNITY_BUILD_BASE}/XR-Rooms.framework.js.br`,
  codeUrl: `${UNITY_BUILD_BASE}/XR-Rooms.wasm.br`,
  streamingAssetsUrl: `${UNITY_BUILD_ROOT}/StreamingAssets`,
  companyName: "3.14P",
  productName: "XR Rooms",
  productVersion: "1.0.2",
  webglContextAttributes: {
    xrCompatible: true,
    preserveDrawingBuffer: true,
  },
};

const XR_DISPLAY_MESSAGES: Record<string, string> = {
  novr: "Tu navegador o dispositivo no soporta WebXR inmersivo. Podés seguir mirando la escena en modo escritorio.",
  // Internal ack from WebXRManager.OnStartXR — not shown as a user banner.
  "xr-started": "",
};

type LoadState = "checking" | "loading" | "loaded" | "error";

interface UnityViewerProps {
  onLoaded?: () => void;
  onBridgeReady?: (bridge: {
    sendMessage: (gameObjectName: string, methodName: string, payload: string) => void;
    addEventListener: (event: string, callback: (...args: any[]) => void) => void;
    removeEventListener: (event: string, callback: (...args: any[]) => void) => void;
  }) => void;
}

/** Unity 6 WebGL requires WebGL 2. Probe before loading the ~8 MB wasm payload. */
function probeWebGL2(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2", { xrCompatible: true }) ??
      canvas.getContext("webgl2");
    if (!gl) {
      return "WebGL 2 no está disponible en este navegador. Unity 6 lo requiere.";
    }
    // Release the probe context — Quest has a low WebGL context limit.
    const loseContext = gl.getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
    return null;
  } catch {
    return "No se pudo crear un contexto WebGL en este navegador.";
  }
}

function explainUnityInitError(message: string): string {
  if (!message.includes("does not support WebGL")) return message;

  return (
    `${message}\n\n` +
    "Esto casi nunca significa que el Quest o Chrome “no soporten” WebGL. Suele pasar cuando:\n" +
    "• Hay demasiados contextos WebGL abiertos (muchas recargas con Vite HMR / React Strict Mode en dev).\n" +
    "• Quedó una instancia anterior de Unity sin liberar memoria.\n\n" +
    "Probá: cerrar otras pestañas con Unity, recarga completa (Ctrl+Shift+R), o reiniciar el navegador del Quest."
  );
}

function LoadingOverlay({
  label,
  progress,
}: {
  label: string;
  progress?: number;
}) {
  return (
    <div className="unity-viewer__loading">
      {progress !== undefined && (
        <div className="unity-viewer__bar">
          <div className="unity-viewer__bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      <span className="unity-viewer__pct">{label}</span>
    </div>
  );
}

interface UnityPlayerProps {
  onLoaded?: () => void;
  onBridgeReady?: UnityViewerProps["onBridgeReady"];
  onError: (message: string) => void;
}

/**
 * Mounted only after server + WebGL preflight pass, so we don't spawn Unity
 * (and consume a WebGL context) while still verifying the build.
 */
function UnityPlayer({ onLoaded, onBridgeReady, onError }: UnityPlayerProps) {
  const {
    unityProvider,
    isLoaded,
    loadingProgression,
    initialisationError,
    sendMessage,
    addEventListener,
    removeEventListener,
    UNSAFE__unityInstance,
  } = useUnityContext(UNITY_CONFIG);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const onBridgeReadyRef = useRef(onBridgeReady);
  onBridgeReadyRef.current = onBridgeReady;

  const {
    isVRSupported,
    isInSession,
    displayMessageId,
    dismissDisplayMessage,
    debugMonoMode,
    setDebugMonoMode,
    enterVR,
    exitVR,
  } = useWebXRBridge({
    isLoaded,
    sendMessage,
    addEventListener,
    removeEventListener,
    unityInstance: UNSAFE__unityInstance,
    gameObjectName: WEBXR_GAME_OBJECT_NAME,
  });

  useEffect(() => {
    if (!initialisationError) return;
    const message =
      initialisationError instanceof Error
        ? initialisationError.message
        : String(initialisationError);
    onError(explainUnityInitError(message));
  }, [initialisationError, onError]);

  const isReady = isLoaded || loadingProgression >= 1;
  const progressPct = Math.round(loadingProgression * 100);

  useEffect(() => {
    if (isReady) onLoadedRef.current?.();
  }, [isReady]);

  // isLoaded alone can flip at progress===1 before unityInstance exists; wait for both
  // so sendMessage is not a no-op. Still stricter than isReady (bar at 100%).
  useEffect(() => {
    if (!isLoaded || !UNSAFE__unityInstance) return;
    onBridgeReadyRef.current?.({
      sendMessage,
      addEventListener,
      removeEventListener,
    });
  }, [isLoaded, UNSAFE__unityInstance, sendMessage, addEventListener, removeEventListener]);

  return (
    <>
      {!isReady && (
        <LoadingOverlay
          label={`${progressPct}%`}
          progress={progressPct}
        />
      )}
      {/* Visibility via class, NOT the style prop: React reconciles the style attribute on every
          re-render, which would wipe the inline width/height the WebXR bridge sets on the canvas
          during an immersive session (Unity samples that client size for its resolution). */}
      <Unity
        ref={canvasRef}
        unityProvider={unityProvider}
        className={`unity-viewer__canvas${isReady ? "" : " unity-viewer__canvas--hidden"}`}
      />

      {isReady && isVRSupported && (
        <div className="unity-viewer__vr-controls">
          {!isInSession && (
            <button
              type="button"
              className={`unity-viewer__mono-toggle${debugMonoMode ? " unity-viewer__mono-toggle--on" : ""}`}
              onClick={() => setDebugMonoMode(!debugMonoMode)}
              title="Aislar estereoscopía: en mono Unity no cambia a CameraL/R"
            >
              {debugMonoMode ? "Mono ON" : "Mono OFF"}
            </button>
          )}
          <button
            type="button"
            className="unity-viewer__vr-button"
            onClick={() => (isInSession ? exitVR() : enterVR().catch(console.error))}
          >
            {isInSession
              ? "Salir de VR"
              : debugMonoMode
                ? "Entrar en VR (mono)"
                : "Entrar en VR"}
          </button>
        </div>
      )}

      {isReady && displayMessageId && XR_DISPLAY_MESSAGES[displayMessageId] && (
        <div className="unity-viewer__banner">
          <p>{XR_DISPLAY_MESSAGES[displayMessageId]}</p>
          <button type="button" onClick={dismissDisplayMessage}>
            Continuar
          </button>
        </div>
      )}
    </>
  );
}

export default function UnityViewer({ onLoaded, onBridgeReady }: UnityViewerProps) {
  const [status, setStatus] = useState<LoadState>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playerKey, setPlayerKey] = useState(0);

  const handlePlayerError = useCallback((message: string) => {
    setStatus("error");
    setErrorMsg(message);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const webglError = probeWebGL2();
    if (webglError) {
      setStatus("error");
      setErrorMsg(webglError);
      return;
    }

    fetch(UNITY_CONFIG.dataUrl, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;

        if (!res.ok) {
          setStatus("error");
          setErrorMsg(
            `No se encontró el build (HTTP ${res.status}) en ${UNITY_CONFIG.dataUrl}. ` +
              "¿Copiaste la carpeta Build/ dentro de public/unity-build/?"
          );
          return;
        }

        const encoding = res.headers.get("content-encoding");
        if (encoding !== "br") {
          setStatus("error");
          setErrorMsg(
            "El servidor no está devolviendo 'Content-Encoding: br' para los archivos .br. " +
              "Revisá vite.config.ts (dev) o vercel.json (prod)."
          );
          return;
        }

        setStatus("loading");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg("No se pudo contactar al servidor para pedir el build de Unity.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "error") {
    return (
      <div className="unity-viewer unity-viewer--error">
        <p className="unity-viewer__title">No se pudo cargar la escena 3D</p>
        {errorMsg && (
          <p className="unity-viewer__detail" style={{ whiteSpace: "pre-line" }}>
            {errorMsg}
          </p>
        )}
        <button
          type="button"
          className="unity-viewer__vr-button"
          style={{ position: "static", marginTop: 16 }}
          onClick={() => {
            setErrorMsg(null);
            setPlayerKey((k) => k + 1);
            setStatus("loading");
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="unity-viewer">
      {status === "checking" && <LoadingOverlay label="Verificando servidor y WebGL..." />}
      {status === "loading" && (
        <UnityPlayer
          key={playerKey}
          onLoaded={onLoaded}
          onBridgeReady={onBridgeReady}
          onError={handlePlayerError}
        />
      )}
    </div>
  );
}
