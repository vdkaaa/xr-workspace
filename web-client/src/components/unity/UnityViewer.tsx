import { useEffect, useRef, useState } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";
import { useWebXRBridge } from "./webxr";
import "./UnityViewer.css";

// Ajustá esta ruta si copiás la carpeta Build/ en otro lugar de /public
const UNITY_BUILD_ROOT = "/unity-build";
const UNITY_BUILD_BASE = `${UNITY_BUILD_ROOT}/Build`;

// Debe coincidir con WebXRManager.GlobalName ("WebXRCameraSet") en Unity.
const WEBXR_GAME_OBJECT_NAME = "WebXRCameraSet";

const UNITY_CONFIG = {
  loaderUrl: `${UNITY_BUILD_BASE}/XR-Rooms.loader.js`,
  dataUrl: `${UNITY_BUILD_BASE}/XR-Rooms.data.br`,
  frameworkUrl: `${UNITY_BUILD_BASE}/XR-Rooms.framework.js.br`,
  codeUrl: `${UNITY_BUILD_BASE}/XR-Rooms.wasm.br`,
  // El Input System genera StreamingAssets/RuntimeActionBindings.json — sin
  // esta ruta Unity intenta pedirlo relativo a "/StreamingAssets" (404 silencioso).
  streamingAssetsUrl: `${UNITY_BUILD_ROOT}/StreamingAssets`,
  // companyName/productName vienen del build actual (placeholder "Cube Randomizer").
  // Cuando Felipe suba el build real con BridgeManager, van a cambiar —
  // no afecta el funcionamiento, solo son metadata.
  companyName: "3.14P",
  productName: "XR Rooms",
  productVersion: "1.0.0",
  // Requerido para que el canvas de Unity pueda ser usado como framebuffer
  // destino de una sesión WebXR (ver Assets/WebXR/Plugins/WebGL/webxr.jspre).
  webglContextAttributes: {
    xrCompatible: true,
    preserveDrawingBuffer: true,
  },
};

// Mensajes legibles para los ids que Unity manda vía displayXRElementId
// (Assets/WebXR/Scripts/WebXRUI.cs -> webxr.jslib -> evento "WebXRDisplayMessage").
const XR_DISPLAY_MESSAGES: Record<string, string> = {
  novr: "Tu navegador o dispositivo no soporta WebXR inmersivo. Podés seguir mirando la escena en modo escritorio.",
};

type LoadState = "checking" | "loading" | "loaded" | "error";

interface UnityViewerProps {
  /** Se dispara una vez que Unity terminó de cargar (Fase B lo va a usar para esperar READY) */
  onLoaded?: () => void;
}

export default function UnityViewer({ onLoaded }: UnityViewerProps) {
  const {
    unityProvider,
    isLoaded,
    loadingProgression,
    sendMessage,
    addEventListener,
    removeEventListener,
    UNSAFE__unityInstance,
  } = useUnityContext(UNITY_CONFIG);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState<LoadState>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { isVRSupported, isInSession, displayMessageId, dismissDisplayMessage, enterVR, exitVR } =
    useWebXRBridge({
      isLoaded,
      sendMessage,
      addEventListener,
      removeEventListener,
      unityInstance: UNSAFE__unityInstance,
      gameObjectName: WEBXR_GAME_OBJECT_NAME,
    });

  // Preflight: confirma que el servidor manda los headers correctos
  // para los archivos .br ANTES de dejar que Unity intente cargarlos.
  // Sin esto, un mal-config de servidor se ve como "canvas negro sin
  // ningún error en consola" — muy difícil de diagnosticar a ciegas.
  useEffect(() => {
    let cancelled = false;

    fetch(UNITY_CONFIG.dataUrl, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;

        if (!res.ok) {
          setStatus("error");
          setErrorMsg(
            `No se encontró el build (HTTP ${res.status}) en ${UNITY_CONFIG.dataUrl}. ` +
              `¿Copiaste la carpeta Build/ dentro de public/unity-build/?`
          );
          return;
        }

        const encoding = res.headers.get("content-encoding");
        if (encoding !== "br") {
          setStatus("error");
          setErrorMsg(
            "El servidor no está devolviendo 'Content-Encoding: br' para los archivos .br. " +
              "Revisá vite.config.ts (dev) o vercel.json (prod) — ver README-fase-A.md."
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

  useEffect(() => {
    if (isLoaded) {
      setStatus("loaded");
      onLoaded?.();
    }
  }, [isLoaded, onLoaded]);

  // Red de seguridad extra: errores no capturados que vengan del propio
  // runtime de Unity (ej. wasm corrupto, memoria insuficiente en el navegador)
  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      if (status === "loaded") return;
      const msg = event.message?.toLowerCase() ?? "";
      if (msg.includes("unity") || msg.includes("wasm")) {
        setStatus("error");
        setErrorMsg(event.message);
      }
    };
    window.addEventListener("error", handleWindowError);
    return () => window.removeEventListener("error", handleWindowError);
  }, [status]);

  if (status === "error") {
    return (
      <div className="unity-viewer unity-viewer--error">
        <p className="unity-viewer__title">No se pudo cargar la escena 3D</p>
        {errorMsg && <p className="unity-viewer__detail">{errorMsg}</p>}
      </div>
    );
  }

  return (
    <div className="unity-viewer">
      {status !== "loaded" && (
        <div className="unity-viewer__loading">
          <div className="unity-viewer__bar">
            <div
              className="unity-viewer__bar-fill"
              style={{ width: `${Math.round(loadingProgression * 100)}%` }}
            />
          </div>
          <span className="unity-viewer__pct">
            {status === "checking"
              ? "Verificando servidor..."
              : `${Math.round(loadingProgression * 100)}%`}
          </span>
        </div>
      )}
      <Unity
        ref={canvasRef}
        unityProvider={unityProvider}
        className="unity-viewer__canvas"
        style={{ visibility: status === "loaded" ? "visible" : "hidden" }}
      />

      {status === "loaded" && isVRSupported && (
        <button
          type="button"
          className="unity-viewer__vr-button"
          onClick={() => (isInSession ? exitVR() : enterVR().catch(console.error))}
        >
          {isInSession ? "Salir de VR" : "Entrar en VR"}
        </button>
      )}

      {status === "loaded" && displayMessageId && (
        <div className="unity-viewer__banner">
          <p>{XR_DISPLAY_MESSAGES[displayMessageId] ?? displayMessageId}</p>
          <button type="button" onClick={dismissDisplayMessage}>
            Continuar
          </button>
        </div>
      )}
    </div>
  );
}