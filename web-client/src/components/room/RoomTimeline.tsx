/**
 * DGO-12: RoomTimeline
 *
 * Muestra el historial de eventos de la sala (timeline) consumiendo
 * GET /api/rooms/:id/history. Soporta paginación por cursor (before).
 */

import { useState, useEffect, useCallback } from "react";
import { getRoomHeaders } from "../../lib/roomHeaders";
import { useAuthStore } from "../../stores/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────
type EventType =
  | "join"
  | "leave"
  | "object_add"
  | "object_delete"
  | "file_upload"
  | "snapshot";

interface SessionEvent {
  id: string;
  room_id: string;
  user_id: string | null;
  event_type: EventType | string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface RoomTimelineProps {
  roomId: string;
}

const PAGE_SIZE = 50;

// ─── Iconos y descripciones por tipo ────────────────────────────────────────────
const EVENT_ICON: Record<string, string> = {
  join: "→",
  leave: "←",
  object_add: "+",
  object_delete: "−",
  file_upload: "↑",
  snapshot: "📸",
};

const EVENT_COLOR: Record<string, string> = {
  join: "text-green-400",
  leave: "text-gray-500",
  object_add: "text-blue-400",
  object_delete: "text-red-400",
  file_upload: "text-purple-400",
  snapshot: "text-yellow-400",
};

function describeEvent(event: SessionEvent): string {
  const p = event.payload ?? {};
  switch (event.event_type) {
    case "join":
      return p.role ? `se unió como ${p.role}` : "se unió a la sala";
    case "leave":
      return typeof p.duration_seconds === "number"
        ? `salió (${p.duration_seconds}s en sala)`
        : "salió de la sala";
    case "object_add":
      return `agregó un objeto${p.type ? ` (${p.type})` : ""}`;
    case "object_delete":
      return "eliminó un objeto";
    case "file_upload":
      return `subió ${(p.filename as string) ?? "un archivo"}`;
    case "snapshot":
      return `creó un snapshot${p.triggered_by ? ` (${p.triggered_by})` : ""}`;
    default:
      return event.event_type;
  }
}

// ─── Timestamp relativo ─────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "hace un momento";
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.round(hr / 24);
  return `hace ${days} d`;
}

// ─── Main component ─────────────────────────────────────────────────────────────
export function RoomTimeline({ roomId }: RoomTimelineProps) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { token } = useAuthStore();
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

  const fetchHistory = useCallback(
    async (before?: string) => {
      if (!token) return;
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (before) params.set("before", before);

        const res = await fetch(
          `${apiUrl}/api/rooms/${roomId}/history?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}`, ...getRoomHeaders() } }
        );
        const data = await res.json();
        if (data.ok) {
          const batch: SessionEvent[] = data.data?.events ?? [];
          setEvents((prev) => (before ? [...prev, ...batch] : batch));
          setHasMore(batch.length === PAGE_SIZE);
        }
      } catch (err) {
        console.error("[RoomTimeline] fetchHistory error:", err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [apiUrl, roomId, token]
  );

  useEffect(() => {
    setIsLoading(true);
    fetchHistory();
  }, [fetchHistory]);

  const handleLoadMore = () => {
    const last = events[events.length - 1];
    if (!last) return;
    setIsLoadingMore(true);
    fetchHistory(last.created_at);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <p className="font-mono text-[10px] text-gray-600 uppercase tracking-widest mb-3">
          Historial de actividad
        </p>

        {isLoading && (
          <div className="flex justify-center mt-6">
            <span className="w-4 h-4 border border-gray-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <p className="text-xs text-gray-600 font-mono text-center mt-6">
            Sin actividad todavía.
          </p>
        )}

        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}

        {!isLoading && hasMore && events.length > 0 && (
          <button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="w-full mt-3 py-2 px-3 rounded-lg border border-gray-800 text-[11px] font-mono text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all disabled:opacity-50"
          >
            {isLoadingMore ? "Cargando..." : "Cargar más"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Event row ──────────────────────────────────────────────────────────────────
function EventRow({ event }: { event: SessionEvent }) {
  const icon = EVENT_ICON[event.event_type] ?? "•";
  const color = EVENT_COLOR[event.event_type] ?? "text-gray-400";
  const actor = event.user_id ? event.user_id.slice(0, 8) : "sistema";

  return (
    <div className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-800/50 transition-colors">
      <span className={`text-sm font-mono flex-shrink-0 w-4 text-center ${color}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 truncate">
          <span className="text-gray-400 font-mono">{actor}</span>{" "}
          {describeEvent(event)}
        </p>
        <p className="text-[10px] text-gray-600 font-mono">
          {relativeTime(event.created_at)}
        </p>
      </div>
    </div>
  );
}
