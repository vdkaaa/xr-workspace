-- DGO-11 — Cron automático de snapshots (cada 30 min)
-- Ejecutar manualmente en el Supabase SQL Editor.

-- ─── 1. Verificar si pg_cron está disponible ───────────────────────────────────
-- Si esta consulta devuelve una fila, pg_cron está instalado y puedes usar el
-- bloque (A). Si no devuelve filas, usa la alternativa (B) con el endpoint interno.

SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- ─── (A) pg_cron DISPONIBLE ────────────────────────────────────────────────────
-- Programa un snapshot 'cron' cada 30 minutos para las salas activas.
-- NOTA: este cron sólo persiste spatial_state (copiado de rooms.spatial_state);
-- el liveblocks_state queda null porque pg_cron no puede llamar a la REST API de
-- Liveblocks. Para capturar también Liveblocks usa la alternativa (B).

SELECT cron.schedule(
  'snapshot-rooms-30min',
  '*/30 * * * *',
  $$
    INSERT INTO room_snapshots (room_id, spatial_state, triggered_by)
    SELECT id, spatial_state, 'cron'
    FROM rooms
    WHERE updated_at > now() - interval '31 minutes';
  $$
);

-- Para desprogramarlo:
-- SELECT cron.unschedule('snapshot-rooms-30min');


-- ─── (B) pg_cron NO DISPONIBLE — alternativa con endpoint interno ───────────────
-- No requiere SQL. El backend expone:
--
--   POST /api/internal/snapshot-all
--   Header: x-cron-secret: <CRON_SECRET>
--
-- Este endpoint itera todas las salas activas y llama a createSnapshot()
-- (incluyendo el estado de Liveblocks vía REST).
--
-- Configúralo en Railway → Settings → Cron Jobs:
--   Schedule: */30 * * * *
--   Command:  curl -X POST "$APP_URL/api/internal/snapshot-all" \
--               -H "x-cron-secret: $CRON_SECRET"
--
-- Recuerda definir CRON_SECRET en las variables de entorno del backend.
