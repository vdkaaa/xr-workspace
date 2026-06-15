/**
 * DGO-07: RoomDetail actualizado con Liveblocks
 *
 * Cambios respecto a la versión anterior (DGO-03):
 * - Envuelto en LiveblocksRoomProvider
 * - Header muestra PresenceAvatars con usuarios en tiempo real
 * - Cursor tracking en el área de la sala
 * - useStatus para mostrar estado de conexión
 *
 * DGO-08 agregará la escena Three.js dentro de este componente.
 * DGO-09 agregará el panel lateral de objetos y participantes.
 */

import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";
import { LiveblocksRoomProvider } from "../components/liveblocks/LiveblocksRoomProvider";
import { PresenceAvatars } from "../components/liveblocks/PresenceAvatars";
import { useUpdateMyPresence, useStatus } from "../lib/liveblocks";

// ─── Outer shell (sin Liveblocks) ─────────────────────────────────────────────
// El provider necesita el roomId, que viene del store.
// Por eso el fetch de la sala ocurre aquí, antes del provider.
export function RoomDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rooms, fetchRooms, isLoading, error } = useRoomStore();
  const token = useAuthStore((s) => s.token);

  // Derivar la sala del array de rooms por id de URL
  const currentRoom = rooms.find((r) => r.id === id);

  useEffect(() => {
    if (token) fetchRooms(token);
  }, [token, fetchRooms]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !currentRoom) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-gray-950">
        <p className="text-red-400 font-mono text-sm">
          {error ?? "Sala no encontrada"}
        </p>
        <button
          onClick={() => navigate("/rooms")}
          className="text-blue-400 text-sm underline font-mono"
        >
          Volver a salas
        </button>
      </div>
    );
  }

  return (
    // roomId = UUID de Supabase → mismo ID que usa Liveblocks para la sala
    <LiveblocksRoomProvider roomId={currentRoom.id}>
      <RoomContent roomName={currentRoom.name} />
    </LiveblocksRoomProvider>
  );
}

// ─── Inner content (dentro de Liveblocks) ────────────────────────────────────
// Puede usar todos los hooks de Liveblocks porque está dentro del RoomProvider.
interface RoomContentProps {
  roomName: string;
}

function RoomContent({ roomName }: RoomContentProps) {
  const updatePresence = useUpdateMyPresence();
  const connectionStatus = useStatus();
  const [showDebug, setShowDebug] = useState(false);

  // Actualizar cursor al mover el mouse sobre el área de sala
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    updatePresence({
      cursor: {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      },
    });
  };

  const handleMouseLeave = () => {
    updatePresence({ cursor: null });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-gray-500">XR ROOMS</span>
          <span className="text-gray-600">/</span>
          <h1 className="text-sm font-semibold text-gray-100">{roomName}</h1>

          {/* Badge estado conexión */}
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
              connectionStatus === "connected"
                ? "bg-green-900/50 text-green-400 border border-green-800"
                : connectionStatus === "connecting"
                ? "bg-yellow-900/50 text-yellow-400 border border-yellow-800"
                : "bg-red-900/50 text-red-400 border border-red-800"
            }`}
          >
            {connectionStatus}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Avatares en tiempo real — DGO-07 */}
          <PresenceAvatars />

          {/* Debug toggle en dev */}
          {import.meta.env.DEV && (
            <button
              onClick={() => setShowDebug((v) => !v)}
              className="text-[10px] font-mono text-gray-600 hover:text-gray-400"
            >
              {showDebug ? "hide debug" : "debug"}
            </button>
          )}
        </div>
      </header>

      {/* ── Main area ── */}
      <main
        className="flex-1 relative overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* DGO-08 → <RoomScene /> irá aquí */}
        {/* DGO-09 → panel lateral de objetos irá aquí */}
        <RoomPlaceholder />

        {/* Debug panel (solo en dev) */}
        {showDebug && import.meta.env.DEV && <DebugPanel />}
      </main>
    </div>
  );
}

// ─── Placeholder ──────────────────────────────────────────────────────────────
// Se reemplaza en DGO-08 con la escena Three.js
function RoomPlaceholder() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-2">
        <p className="text-gray-600 font-mono text-sm">
          Liveblocks conectado ✓
        </p>
        <p className="text-gray-700 font-mono text-xs">
          Three.js scene → DGO-08
        </p>
      </div>
    </div>
  );
}

// ─── Debug panel (dev only) ───────────────────────────────────────────────────
import { useOthers, useSelf, useStorage } from "../lib/liveblocks";
// ^ import al final es válido en TS pero Cursor puede quejarse — mover arriba si lo pide

function DebugPanel() {
  const self = useSelf();
  const others = useOthers();
  const strokes = useStorage((root) => root.strokes.length);

  return (
    <div className="absolute bottom-4 right-4 bg-gray-900/90 border border-gray-700 rounded-lg p-3 font-mono text-xs text-gray-400 max-w-xs">
      <p className="text-gray-500 mb-2">── liveblocks debug ──</p>
      <p>
        self:{" "}
        <span className="text-blue-400">{self?.presence.displayName}</span>
      </p>
      <p>
        others:{" "}
        <span className="text-green-400">{others.length}</span>
      </p>
      <p>
        strokes in storage:{" "}
        <span className="text-purple-400">{strokes ?? 0}</span>
      </p>
      <p>
        status:{" "}
        <span className="text-yellow-400">{self?.presence.status}</span>
      </p>
    </div>
  );
}