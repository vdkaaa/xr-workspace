/**
 * DGO-07: PresenceAvatars
 *
 * Muestra los avatares de usuarios conectados en tiempo real.
 * Usa useOthersMapped para re-render eficiente (solo cuando cambia
 * displayName o avatarUrl, no cada vez que mueve el cursor).
 *
 * También exporta CursorOverlay para mostrar cursores en el pizarrón.
 */

import { useOthersMapped, useSelf, useStatus } from "../../lib/liveblocks";

// ─── Presence Avatars (barra lateral / header) ────────────────────────────────
export function PresenceAvatars() {
  // useOthersMapped evita re-renders innecesarios al mover cursor.
  // Solo re-renderiza si cambia la info mapeada (nombre, avatar).
  const others = useOthersMapped((other) => ({
    displayName: other.presence.displayName,
    avatarUrl: other.presence.avatarUrl,
    status: other.presence.status,
  }));

  const self = useSelf();
  const connectionStatus = useStatus();

  const isConnected = connectionStatus === "connected";

  return (
    <div className="flex items-center gap-2">
      {/* Badge de conexión */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isConnected ? "bg-green-400" : "bg-yellow-400 animate-pulse"
        }`}
        title={isConnected ? "Connected" : "Reconnecting..."}
      />

      {/* Avatar propio */}
      {self && (
        <Avatar
          name={self.presence.displayName}
          avatarUrl={self.presence.avatarUrl}
          isSelf
        />
      )}

      {/* Avatares de otros usuarios */}
      {others.map(([connectionId, data]) => (
        <Avatar
          key={connectionId}
          name={data.displayName}
          avatarUrl={data.avatarUrl}
          status={data.status}
        />
      ))}

      {/* Contador si hay muchos */}
      {others.length > 0 && (
        <span className="text-xs text-gray-500 font-mono ml-1">
          {others.length + 1} in room
        </span>
      )}
    </div>
  );
}

// ─── Avatar individual ────────────────────────────────────────────────────────
interface AvatarProps {
  name: string;
  avatarUrl: string | null;
  isSelf?: boolean;
  status?: "idle" | "drawing" | "viewing";
}

function Avatar({ name, avatarUrl, isSelf = false, status }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const statusColor = {
    drawing: "ring-purple-400",
    viewing: "ring-blue-400",
    idle: "ring-gray-600",
  }[status ?? "idle"];

  return (
    <div
      className={`relative w-8 h-8 rounded-full ring-2 ${
        isSelf ? "ring-green-400" : statusColor
      } overflow-hidden flex-shrink-0 transition-all`}
      title={isSelf ? `${name} (you)` : name}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
          <span className="text-[10px] font-mono font-bold text-gray-300">
            {initials}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Cursor Overlay (para pizarrón) ──────────────────────────────────────────
/**
 * Renderiza los cursores de otros usuarios sobre el canvas.
 * Se posiciona absolute dentro del contenedor del pizarrón.
 *
 * Uso:
 *   <div className="relative">
 *     <Whiteboard />
 *     <CursorOverlay />
 *   </div>
 */
export function CursorOverlay() {
  const others = useOthersMapped((other) => ({
    cursor: other.presence.cursor,
    displayName: other.presence.displayName,
  }));

  return (
    <>
      {others.map(([connectionId, data]) => {
        if (!data.cursor) return null;

        return (
          <RemoteCursor
            key={connectionId}
            x={data.cursor.x}
            y={data.cursor.y}
            name={data.displayName}
          />
        );
      })}
    </>
  );
}

// ─── Cursor individual ────────────────────────────────────────────────────────
function RemoteCursor({
  x,
  y,
  name,
}: {
  x: number;
  y: number;
  name: string;
}) {
  return (
    <div
      className="absolute pointer-events-none z-50 flex items-start gap-1"
      style={{ left: x, top: y, transform: "translate(-2px, -2px)" }}
    >
      {/* Puntero SVG */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="drop-shadow-sm"
      >
        <path
          d="M0 0L0 11L3.5 8.5L5.5 13L7 12.5L5 8L8.5 7.5L0 0Z"
          fill="#a78bfa"
          stroke="#1a1a2e"
          strokeWidth="0.5"
        />
      </svg>
      {/* Label con nombre */}
      <span className="bg-purple-500 text-white text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm">
        {name}
      </span>
    </div>
  );
}