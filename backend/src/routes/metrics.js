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

/**
 * @swagger
 * /api/metrics:
 *   get:
 *     tags: [Internal, Metrics]
 *     summary: (Interno) Métricas operativas del servicio
 *     description: |
 *       **Uso interno/operativo — no para consumo público.** Sin autenticación de usuario.
 *       Si la variable de entorno `METRICS_KEY` está definida, exige `?key=<METRICS_KEY>`.
 *     security: []
 *     parameters:
 *       - name: key
 *         in: query
 *         required: false
 *         schema: { type: string }
 *         description: Requerido solo si METRICS_KEY está configurada en el entorno
 *     responses:
 *       200:
 *         description: Métricas actuales
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 totalRequests: 15234
 *                 total5xxErrors: 2
 *                 activeRooms: 4
 *                 activeRoomsWindowMinutes: 30
 *                 uptimeSeconds: 86400
 *       401:
 *         description: key ausente o incorrecta (cuando METRICS_KEY está configurada)
 *         content:
 *           application/json:
 *             example: { ok: false, error: "No autorizado" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
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
