import { Router } from 'express'
import * as snapshotService from '../services/snapshotService.js'
import { ok, errors } from '../lib/response.js'

const router = Router()

/**
 * @swagger
 * /api/internal/snapshot-all:
 *   post:
 *     tags: [Internal]
 *     summary: (Interno) Disparar snapshots de todas las salas activas
 *     description: |
 *       **Uso interno — no para consumo público.** Pensado para ser llamado por un cron
 *       job de Railway (Settings → Cron Jobs) cuando pg_cron no está disponible en Supabase.
 *       Protegido por `CRON_SECRET` vía el header `x-cron-secret` (no usa JWT de usuario).
 *     security: []
 *     parameters:
 *       - name: x-cron-secret
 *         in: header
 *         required: true
 *         schema: { type: string }
 *         description: Debe coincidir con la variable de entorno CRON_SECRET
 *     responses:
 *       200:
 *         description: Snapshots generados
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 count: 3
 *                 results:
 *                   - room_id: "8a1e...-room"
 *                     ok: true
 *                     snapshot_id: "snap-9"
 *       401:
 *         description: x-cron-secret ausente o incorrecto
 *         content:
 *           application/json:
 *             example: { ok: false, error: "No autenticado" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
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
