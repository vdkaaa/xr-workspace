import UnityViewer from "../components/unity/UnityViewer";

export default function UnityTestPage() {
  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>
        Test — Carga de Unity WebGL (Fase A)
      </h1>
      <UnityViewer onLoaded={() => console.log("[Unity] cargado OK")} />
    </div>
  );
}