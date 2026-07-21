/**
 * DGO-09: RoomDashboard
 *
 * Panel lateral 2D con:
 * - Participantes activos via Liveblocks useOthers + useSelf
 * - Lista de objetos espaciales desde Supabase (spatial_objects)
 * - Botón de upload de archivos (usa el endpoint DGO-06)
 *
 * Se monta como panel colapsable sobre la escena Three.js (RoomScene).
 */

import { useState, useEffect } from "react";
import { useOthers, useSelf } from "../../lib/liveblocks";
import { getRoomHeaders } from "../../lib/roomHeaders";
import { useAuthStore } from "../../stores/authStore";
import { RoomTimeline } from "./RoomTimeline";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SpatialObject {
  id: string;
  type: string;
  content_url: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  updated_at: string;
}

interface RoomDashboardProps {
  roomId: string;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function RoomDashboard({ roomId }: RoomDashboardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"participants" | "objects" | "timeline">("participants");

  return (
    <>
      {/* Toggle button — siempre visible */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-all font-mono text-xs"
        title={isOpen ? "Close panel" : "Open panel"}
      >
        {isOpen ? "→" : "←"}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute top-0 right-0 h-full w-72 bg-gray-950/95 border-l border-gray-800 flex flex-col z-10 backdrop-blur-sm">
          {/* Header tabs */}
          <div className="flex border-b border-gray-800 flex-shrink-0">
            <TabButton
              active={activeTab === "participants"}
              onClick={() => setActiveTab("participants")}
            >
              Participants
            </TabButton>
            <TabButton
              active={activeTab === "objects"}
              onClick={() => setActiveTab("objects")}
            >
              Objects
            </TabButton>
            <TabButton
              active={activeTab === "timeline"}
              onClick={() => setActiveTab("timeline")}
            >
              History
            </TabButton>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "participants" && <ParticipantsTab />}
            {activeTab === "objects" && <ObjectsTab roomId={roomId} />}
            {activeTab === "timeline" && <RoomTimeline roomId={roomId} />}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 text-xs font-mono transition-colors ${
        active
          ? "text-blue-400 border-b-2 border-blue-400 bg-blue-950/20"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Participants Tab ─────────────────────────────────────────────────────────
function ParticipantsTab() {
  const others = useOthers();
  const self = useSelf();

  const statusLabel = {
    idle: "in room",
    drawing: "drawing",
    viewing: "viewing",
  };

  const statusColor = {
    idle: "text-gray-500",
    drawing: "text-purple-400",
    viewing: "text-blue-400",
  };

  return (
    <div className="p-3 space-y-1">
      <p className="font-mono text-[10px] text-gray-600 uppercase tracking-widest mb-3">
        {others.length + 1} connected
      </p>

      {/* Usuario propio */}
      {self && (
        <ParticipantRow
          name={self.presence.displayName}
          status={self.presence.status}
          isSelf
          statusLabel={statusLabel}
          statusColor={statusColor}
        />
      )}

      {/* Otros usuarios */}
      {others.map((other) => (
        <ParticipantRow
          key={other.connectionId}
          name={other.presence.displayName}
          status={other.presence.status}
          statusLabel={statusLabel}
          statusColor={statusColor}
        />
      ))}

      {others.length === 0 && (
        <p className="text-xs text-gray-600 font-mono mt-4 text-center">
          Just you in the room
        </p>
      )}
    </div>
  );
}

function ParticipantRow({
  name,
  status,
  isSelf = false,
  statusLabel,
  statusColor,
}: {
  name: string;
  status: "idle" | "drawing" | "viewing";
  isSelf?: boolean;
  statusLabel: Record<string, string>;
  statusColor: Record<string, string>;
}) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-800/50 transition-colors">
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0 ${
          isSelf
            ? "bg-green-900/50 text-green-400 ring-1 ring-green-600"
            : "bg-blue-900/50 text-blue-400 ring-1 ring-blue-800"
        }`}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-200 truncate font-medium">
          {name} {isSelf && <span className="text-gray-600">(you)</span>}
        </p>
        <p className={`text-[10px] font-mono ${statusColor[status]}`}>
          {statusLabel[status]}
        </p>
      </div>

      {/* Dot de presencia */}
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        isSelf ? "bg-green-400" : "bg-blue-400"
      }`} />
    </div>
  );
}

// ─── Objects Tab ──────────────────────────────────────────────────────────────
function ObjectsTab({ roomId }: { roomId: string }) {
  const [objects, setObjects] = useState<SpatialObject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const { token } = useAuthStore();
  const apiUrl = import.meta.env.VITE_API_URL;

  // Fetch spatial objects
  const fetchObjects = async () => {
    if (!token) return;
    try {
      const res = await fetch(
        `${apiUrl}/api/spatial-objects?room_id=${roomId}`,
        { headers: { Authorization: `Bearer ${token}`, ...getRoomHeaders() } }
      );
      const data = await res.json();
      if (data.ok) setObjects(data.data ?? []);
    } catch (err) {
      console.error("[RoomDashboard] fetchObjects error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchObjects();
  }, [roomId, token]);

  // Upload file (usa DGO-06 endpoint)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("room_id", roomId);
      formData.append("type", file.type.startsWith("image/") ? "image" : "document");

      const res = await fetch(`${apiUrl}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, ...getRoomHeaders() },
        body: formData,
      });

      const data = await res.json();
      if (data.ok) {
        await fetchObjects(); // refrescar lista
      }
    } catch (err) {
      console.error("[RoomDashboard] upload error:", err);
    } finally {
      setIsUploading(false);
      e.target.value = ""; // reset input
    }
  };

  const objectTypeIcon: Record<string, string> = {
    image: "🖼",
    document: "📄",
    model: "📦",
    note: "📝",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Upload button */}
      <div className="p-3 border-b border-gray-800 flex-shrink-0">
        <label className={`flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg border text-xs font-mono cursor-pointer transition-all ${
          isUploading
            ? "border-gray-700 text-gray-600 cursor-not-allowed"
            : "border-blue-800 text-blue-400 hover:bg-blue-950/30 hover:border-blue-600"
        }`}>
          {isUploading ? (
            <>
              <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
              Uploading...
            </>
          ) : (
            <>↑ Upload file</>
          )}
          <input
            type="file"
            className="hidden"
            accept="image/*,.pdf"
            onChange={handleUpload}
            disabled={isUploading}
          />
        </label>
        <p className="text-[10px] text-gray-700 font-mono mt-1.5 text-center">
          images and PDF · max 10MB
        </p>
      </div>

      {/* Objects list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <p className="font-mono text-[10px] text-gray-600 uppercase tracking-widest mb-3">
          {objects.length} object{objects.length !== 1 ? "s" : ""}
        </p>

        {isLoading && (
          <div className="flex justify-center mt-6">
            <span className="w-4 h-4 border border-gray-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && objects.length === 0 && (
          <p className="text-xs text-gray-600 font-mono text-center mt-6">
            No objects in the room.
            <br />Upload a file to get started.
          </p>
        )}

        {objects.map((obj) => (
          <ObjectRow key={obj.id} object={obj} icon={objectTypeIcon[obj.type] ?? "📦"} />
        ))}
      </div>
    </div>
  );
}

function ObjectRow({ object, icon }: { object: SpatialObject; icon: string }) {
  const label =
    (object.metadata?.filename as string) ??
    (object.metadata?.name as string) ??
    object.type;

  const date = new Date(object.updated_at).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-800/50 transition-colors group">
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 truncate font-medium">{label}</p>
        <p className="text-[10px] text-gray-600 font-mono">{date}</p>
      </div>
      {object.content_url && (
        <a
          href={object.content_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-gray-600 hover:text-blue-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        >
          view
        </a>
      )}
    </div>
  );
}