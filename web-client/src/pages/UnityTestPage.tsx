import UnityViewer from "../components/unity/UnityViewer";

declare global {
  interface Window {
    __unityBridge?: {
      sendMessage: (
        gameObjectName: string,
        methodName: string,
        payload: string
      ) => void;
      addEventListener: (event: string, callback: (...args: any[]) => void) => void;
      removeEventListener: (
        event: string,
        callback: (...args: any[]) => void
      ) => void;
    };
  }
}

// TEMP — console testing helpers; remove when E2E bridge is wired for real
let bridgeReadyCalls = 0;

function onUnityMessage(...args: any[]) {
  console.log("[UnityMessage]", args[0]);
}

export default function UnityTestPage() {
  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>
        Test — Carga de Unity WebGL (Fase A)
      </h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
        Consola: <code>window.__unityBridge</code> — sendMessage / addEventListener
      </p>
      <UnityViewer
        onLoaded={() => console.log("[Unity] cargado OK")}
        onBridgeReady={(bridge) => {
          bridgeReadyCalls += 1;
          window.__unityBridge = bridge;
          bridge.addEventListener("UnityMessage", onUnityMessage);
          console.log("[Unity] window.__unityBridge listo", {
            call: bridgeReadyCalls,
            at: performance.now(),
          });
          console.log(
            "[Unity] Tip: __unityBridge.sendMessage('BridgeManager','OnReactMessage', JSON.stringify({type:'INIT',payload:{jwt:'x',roomId:'r',userId:'u'}}))"
          );
        }}
      />
    </div>
  );
}
