// src/routes/metrics.js
// DGO-17 — GET /api/metrics: métricas básicas de monitoring.
//
// Sin autenticación de usuario (no requireAuth) para que herramientas de
// monitoring externas puedan pegarle fácil. Si se define METRICS_KEY en el
// entorno, se exige como query param ?key=... para no dejarlo totalmente
// abierto en producción.

import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { getErrorTrackerMetrics } from '../middleware/errorTracker.js'
import { ok, fail } from '../lib/response.js'
import { logger } from '../lib/logger.js'

const router = Router()

// Ventana para considerar una sala "activa": tuvo actividad reciente
// (mismo criterio que snapshotService.snapshotActiveRooms).
const ACTIVE_ROOM_WINDOW_MINUTES = 30

router.get('/', async (req, res, next) => {
  try {
    const metricsKey = process.env.METRICS_KEY
    if (metricsKey && req.query.key !== metricsKey) {
      return fail(res, 'No autorizado', 401)
    }

    const since = new Date(Date.now() - ACTIVE_ROOM_WINDOW_MINUTES * 60 * 1000).toISOString()
    const { count: activeRooms, error } = await supabaseAdmin
      .from('rooms')
      .select('*', { count: 'exact', head: true })
      .gt('updated_at', since)

    if (error) throw error

    const { totalRequests, total5xxErrors } = getErrorTrackerMetrics()

    return ok(res, {
      totalRequests,
      total5xxErrors,
      activeRooms: activeRooms ?? 0,
      activeRoomsWindowMinutes: ACTIVE_ROOM_WINDOW_MINUTES,
      uptimeSeconds: Math.round(process.uptime()),
    })
  } catch (err) {
    logger.error({ err }, '[metrics] Error obteniendo métricas')
    next(err)
  }
})

export default router
