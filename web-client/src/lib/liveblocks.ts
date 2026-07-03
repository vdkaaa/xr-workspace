/**
 * DGO-07: Liveblocks typed client
 *
 * Presence  → datos volátiles por usuario (posición cursor, estado avatar)
 * Storage   → estado persistente de la sala (pizarrón = CRDT, resuelve conflictos)
 * UserMeta  → info del usuario autenticado pasada al auth endpoint
 *
 * Docs: https://liveblocks.io/docs/api-reference/liveblocks-react
 */

import { createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";
import type { LiveList, LiveMap, LiveObject } from "@liveblocks/client";

// ─── Presence ───────────────────────────────────────────────────────────────
// Estado efímero por usuario — se resetea al desconectarse
export type Presence = {
  /** Posición del cursor en canvas 2D (null si no está en el pizarrón) */
  cursor: { x: number; y: number } | null;
  /** Nombre visible en sala */
  displayName: string;
  /** URL avatar Ready Player Me (null si no tiene) */
  avatarUrl: string | null;
  /** Estado actual del usuario en la sala */
  status: "idle" | "drawing" | "viewing";
};

// ─── Storage ─────────────────────────────────────────────────────────────────
// Estado persistente CRDT — sobrevive reconexiones, resuelve conflictos automáticamente
export type WhiteboardStroke = {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  createdBy: string;
};

export type SpatialObjectRef = {
  id: string;       // FK → spatial_objects.id en Supabase
  type: string;
  label: string;
};

export type Storage = {
  /** Trazos del pizarrón — LiveList para mantener orden de dibujado */
  strokes: LiveList<LiveObject<WhiteboardStroke>>;
  /** Índice de objetos activos en sala — LiveMap para lookup O(1) por id */
  objects: LiveMap<string, LiveObject<SpatialObjectRef>>;
};

// ─── UserMeta ─────────────────────────────────────────────────────────────────
// Info del JWT que el backend inyecta en el token Liveblocks
export type UserMeta = {
  id: string;
  info: {
    name: string;
    avatarUrl: string | null;
  };
};

// ─── Client ───────────────────────────────────────────────────────────────────
const client = createClient({
  /**
   * authEndpoint apunta al backend Express (DGO-07 backend).
   * El backend verifica el JWT y genera el token Liveblocks
   * con los permisos correctos para la sala.
   */
  authEndpoint: async (room) => {
    const token = localStorage.getItem("xr_token");
    const res = await fetch(
      `${import.meta.env.VITE_API_URL}/api/liveblocks/auth`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ room }),
      }
    );

    if (!res.ok) {
      throw new Error(`Liveblocks auth failed: ${res.status}`);
    }

    return res.json();
  },
});

// ─── Room Context ─────────────────────────────────────────────────────────────
// Exporta todos los hooks tipados: useMyPresence, useOthers, useStorage, etc.
export const {
  RoomProvider,
  useMyPresence,
  useUpdateMyPresence,
  useOthers,
  useOthersMapped,
  useSelf,
  useStorage,
  useMutation,
  useRoom,
  useStatus,
  RoomContext,
} = createRoomContext<Presence, Storage, UserMeta>(client);