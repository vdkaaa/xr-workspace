import { Router } from 'express'
import * as snapshotService from '../services/snapshotService.js'
import { ok, errors } from '../lib/response.js'

const router = Router()

/**
 * POST /api/internal/snapshot-all
 *
 * Endpoint interno para disparar snapshots de todas las salas activas.
 * Protegido por CRON_SECRET en el header `x-cron-secret`.
 * Pensado para ser llamado por un cron job de Railway (Settings → Cron Jobs)
 * cuando pg_cron no está disponible en Supabase.
 */
router.post('/snapshot-all', async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET
    const provided = req.headers['x-cron-secret']

    if (!secret || provided !== secret) {
      return errors.unauthorized(res)
    }

    const results = await snapshotService.snapshotActiveRooms()
    return ok(res, { count: results.length, results })
  } catch (err) {
    next(err)
  }
})

export default router
