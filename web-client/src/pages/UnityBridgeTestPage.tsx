import { useEffect, useState } from "react";
import { createMockBridge } from "../components/unity/__mocks__/mockBridge";
import { useUnityBridge } from "../components/unity/useUnityBridge";
import { useUnityMessageRouter } from "../components/unity/useUnityMessageRouter";

const TEST_JWT = "test-jwt-placeholder";
const TEST_ROOM_ID = "room-demo-001";
const TEST_USER_ID = "user-demo-001";

export default function UnityBridgeTestPage() {
  const messageRouter = useUnityMessageRouter();
  const { status, errorMessage, registerBridge, changeRoom, logout } =
    useUnityBridge({
      jwt: TEST_JWT,
      roomId: TEST_ROOM_ID,
      userId: TEST_USER_ID,
      messageRouter,
    });

  const [currentRoomId, setCurrentRoomId] = useState(TEST_ROOM_ID);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  const markEvent = (label: string) => {
    setLastEvent(label);
    setLastEventAt(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    const mockBridge = createMockBridge();
    messageRouter.registerBridge(mockBridge);
    registerBridge(mockBridge);
  }, [messageRouter, registerBridge]);

  useEffect(() => {
    if (status === "authenticating") markEvent("READY received");
    else if (status === "ready") markEvent("OK received");
  }, [status]);

  useEffect(() => {
    if (errorMessage) markEvent("ERROR received");
  }, [errorMessage]);

  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>
        Test — useUnityBridge (MockBridge)
      </h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
        No Unity build. The mock emits READY → INIT → OK.
      </p>

      <p style={{ fontSize: 14, marginBottom: 8 }}>
        Status:{" "}
        <strong style={{ fontFamily: "monospace" }}>{status}</strong>
      </p>
      <p style={{ fontSize: 14, marginBottom: 8 }}>
        Room:{" "}
        <strong style={{ fontFamily: "monospace" }}>{currentRoomId}</strong>
      </p>
      <p style={{ fontSize: 14, marginBottom: 8 }}>
        Last event:{" "}
        <strong style={{ fontFamily: "monospace" }}>
          {lastEvent ?? "—"}
        </strong>
        {lastEventAt && (
          <span style={{ color: "#666", marginLeft: 8 }}>({lastEventAt})</span>
        )}
      </p>
      {errorMessage && (
        <p style={{ fontSize: 13, color: "#b00020", marginBottom: 16 }}>
          Error: {errorMessage}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          disabled={status !== "ready"}
          onClick={() => {
            const next = "room-demo-002";
            changeRoom(next);
            setCurrentRoomId(next);
            markEvent("CHANGE_ROOM sent");
          }}
        >
          changeRoom → room-demo-002
        </button>
        <button
          type="button"
          onClick={() => {
            logout();
            markEvent("LOGOUT sent");
          }}
        >
          logout
        </button>
      </div>
    </div>
  );
}
