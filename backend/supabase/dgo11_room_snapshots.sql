-- DGO-11 — Snapshot del estado de sala
-- Ejecutar manualmente en el Supabase SQL Editor.

-- ─── Tabla room_snapshots ──────────────────────────────────────────────────────

CREATE TABLE room_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  triggered_by text DEFAULT 'cron',  -- 'cron' | 'manual'
  spatial_state jsonb,
  liveblocks_state jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON room_snapshots (room_id, created_at DESC);

-- ─── RLS: solo miembros de la sala pueden leer sus snapshots ────────────────────

ALTER TABLE room_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "miembros pueden leer snapshots"
  ON room_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = room_snapshots.room_id
        AND user_id = auth.uid()
    )
  );
