/**
 * DGO-07: LiveblocksRoomProvider
 *
 * Wrapper que envuelve cada sala individual con el RoomProvider.
 * - roomId debe coincidir con el UUID de la sala en Supabase
 * - Inicializa Storage con LiveList y LiveMap vacíos si la sala es nueva
 * - Muestra fallback de loading/error mientras conecta
 *
 * Uso:
 *   <LiveblocksRoomProvider roomId={room.id}>
 *     <RoomScene />
 *   </LiveblocksRoomProvider>
 */

import { LiveList, LiveMap, LiveObject } from "@liveblocks/client";
import { ClientSideSuspense } from "@liveblocks/react";
import { RoomProvider } from "../../lib/liveblocks";
import type { Presence } from "../../lib/liveblocks";
import { useAuthStore } from "../../stores/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  roomId: string;
  children: React.ReactNode;
}

// ─── Initial Presence ─────────────────────────────────────────────────────────
function getInitialPresence(displayName: string): Presence {
  return {
    cursor: null,
    displayName,
    avatarUrl: null,
    status: "idle",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function LiveblocksRoomProvider({ roomId, children }: Props) {
  const user = useAuthStore((s) => s.user);
  const displayName = user?.name ?? user?.email?.split("@")[0] ?? "Usuario";

  return (
    <RoomProvider
      id={roomId}
      /**
       * initialPresence se aplica solo cuando el usuario entra por primera vez.
       * Liveblocks lo sincroniza a todos los demás inmediatamente.
       */
      initialPresence={getInitialPresence(displayName)}
      /**
       * initialStorage solo aplica si la sala NO tiene storage previo en Liveblocks.
       * Si ya existe, Liveblocks usa el estado guardado (CRDT).
       */
      initialStorage={{
        strokes: new LiveList([]),
        objects: new LiveMap([]),
      }}
    >
      {/**
       * ClientSideSuspense evita el flash de contenido vacío.
       * Muestra el fallback hasta que Liveblocks sincroniza el estado inicial.
       * No usar Suspense de React directamente — este maneja el retry automático.
       */}
      <ClientSideSuspense fallback={<RoomConnecting />}>
        {() => children}
      </ClientSideSuspense>
    </RoomProvider>
  );
}

// ─── Loading fallback ─────────────────────────────────────────────────────────
function RoomConnecting() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-400 font-mono">
          Conectando sala...
        </span>
      </div>
    </div>
  );
}