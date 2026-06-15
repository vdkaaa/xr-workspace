/**
 * DGO-07: useWhiteboard
 *
 * Hook que encapsula todas las mutaciones del pizarrón sobre Liveblocks Storage.
 * Expone funciones tipadas para agregar/eliminar trazos.
 *
 * El CRDT de Liveblocks (LiveList) resuelve automáticamente si dos usuarios
 * dibujan al mismo tiempo — no hay conflictos de merge.
 *
 * Uso:
 *   const { strokes, addStroke, clearStrokes } = useWhiteboard();
 */

import { LiveObject } from "@liveblocks/client";
import { useStorage, useMutation, useUpdateMyPresence } from "../../lib/liveblocks";
import type { WhiteboardStroke } from "../../lib/liveblocks";
import { useSelf } from "../../lib/liveblocks";

export function useWhiteboard() {
  const self = useSelf();
  const updatePresence = useUpdateMyPresence();

  // ─── Read ───────────────────────────────────────────────────────────────────
  // useStorage devuelve un snapshot inmutable del CRDT.
  // Re-renderiza solo cuando strokes cambia.
  const strokes = useStorage((root) => root.strokes);

  // ─── Mutations ──────────────────────────────────────────────────────────────
  // useMutation garantiza que las mutaciones son atómicas en el CRDT.
  // El segundo arg es el array de deps (como useCallback).

  const addStroke = useMutation(
    ({ storage }, stroke: Omit<WhiteboardStroke, "id" | "createdBy">) => {
      const newStroke = new LiveObject<WhiteboardStroke>({
        id: crypto.randomUUID(),
        createdBy: self?.id ?? "unknown",
        ...stroke,
      });
      storage.get("strokes").push(newStroke);
    },
    [self?.id]
  );

  const removeStroke = useMutation(
    ({ storage }, strokeId: string) => {
        const strokes = storage.get("strokes");
        const index = strokes.findIndex((s) => s.get("id") === strokeId);
        if (index !== -1) strokes.delete(index);
    },
    []
  );

  const clearStrokes = useMutation(({ storage }) => {
    // Limpia solo los trazos del usuario actual
    const strokes = storage.get("strokes");
    const toDelete: number[] = [];

    strokes.forEach((stroke, index) => {
      if (stroke.get("createdBy") === self?.id) {
        toDelete.unshift(index); // unshift para borrar de atrás para adelante
      }
    });

    toDelete.forEach((index) => strokes.delete(index));
  }, [self?.id]);

  const clearAll = useMutation(({ storage }) => {
    // Solo para owner/editor — verificar permisos en componente padre
    const strokes = storage.get("strokes");
    while (strokes.length > 0) {
      strokes.delete(0);
    }
  }, []);

  // ─── Cursor tracking ────────────────────────────────────────────────────────
  const updateCursor = (cursor: { x: number; y: number } | null) => {
    updatePresence({ cursor });
  };

  const setStatus = (status: "idle" | "drawing" | "viewing") => {
    updatePresence({ status });
  };

  return {
    strokes: strokes ?? [],
    addStroke,
    removeStroke,
    clearStrokes,
    clearAll,
    updateCursor,
    setStatus,
  };
}