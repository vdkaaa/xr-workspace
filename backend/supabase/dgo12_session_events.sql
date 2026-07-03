-- DGO-12 — Historial de sesiones / timeline
-- Ejecutar manualmente en el Supabase SQL Editor.

-- ─── Tabla session_events ──────────────────────────────────────────────────────

CREATE TABLE session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,  -- 'join' | 'leave' | 'object_add' | 'object_delete' | 'file_upload' | 'snapshot'
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON session_events (room_id, created_at DESC);
CREATE INDEX ON session_events (room_id, event_type);

-- ─── RLS: solo miembros de la sala pueden leer sus eventos ──────────────────────

ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "miembros pueden leer session_events"
  ON session_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = session_events.room_id
        AND user_id = auth.uid()
    )
  );
