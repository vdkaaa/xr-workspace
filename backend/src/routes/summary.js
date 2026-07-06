// src/routes/summary.js
// DGO-15 — Rutas del AI Summary.
//   POST /api/rooms/:id/summarize  -> genera y streamea el resumen (SSE)
//   GET  /api/rooms/:id/summary    -> devuelve el último resumen guardado
//
// Se monta bajo /api/rooms (ver index.js). Usa mergeParams para leer :id.

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/authorize.js'
import {
  streamSummary,
  saveSummary,
  getLatestSummary,
} from '../services/summaryService.js'
import { ok, fail } from '../lib/response.js'
import { logger } from '../lib/logger.js'

const router = Router({ mergeParams: true })

/**
 * @swagger
 * /api/rooms/{id}/summarize:
 *   post:
 *     tags: [Summary (AI)]
 *     summary: Generar un resumen de la sesión (streaming SSE)
 *     description: |
 *       Genera un resumen de la actividad de la sala usando Claude (Anthropic) y lo
 *       transmite progresivamente vía Server-Sent Events. Al finalizar, persiste el
 *       resumen en `room_summaries`.
 *
 *       Consume créditos de la API de Anthropic — por eso requiere rol `editor` u `owner`.
 *       **Rol requerido:** `editor` o superior.
 *
 *       La respuesta NO es JSON: es un stream `text/event-stream` con eventos
 *       `delta` (fragmentos de texto), `done` (resumen completo + stats) y `error`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *       - name: x-room-token
 *         in: header
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Stream SSE con el resumen generándose en tiempo real
 *         content:
 *           text/event-stream:
 *             schema: { type: string }
 *             example: |
 *               event: delta
 *               data: {"text":"La sesión comenzó con..."}

 *               event: done
 *               data: {"id":"sum-1","stats":{"participants":3,"total_events":42}}
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Rol insuficiente (se requiere editor u owner)
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Rol insuficiente para esta acción", required: "editor" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         description: Error generando el resumen (enviado como evento SSE `error`, no como JSON)
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Error generando el resumen" }
 */
// Generar resumen — solo owner/editor (consume créditos de API).
router.post(
  '/:id/summarize',
  requireAuth,
  requireRole('editor'), // rol mínimo: editor y owner pasan; viewer no
  async (req, res) => {
    const roomId = req.params.id
    const userId = req.user.id

    // Server-Sent Events: el cliente recibe el texto progresivamente.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // evita buffering en proxies (Railway)
    })

    try {
      const { summary, stats } = await streamSummary(roomId, (delta) => {
        res.write(`event: delta\ndata: ${JSON.stringify({ text: delta })}\n\n`)
      })

      const saved = await saveSummary({ roomId, userId, summary, stats })

      res.write(`event: done\ndata: ${JSON.stringify({ id: saved.id, stats })}\n\n`)
      res.end()
    } catch (err) {
      logger.error({ err, roomId, userId }, '[summary] error generando resumen')
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: 'Error generando el resumen' })}\n\n`,
      )
      res.end()
    }
  },
)

/**
 * @swagger
 * /api/rooms/{id}/summary:
 *   get:
 *     tags: [Summary (AI)]
 *     summary: Obtener el último resumen guardado
 *     description: Devuelve el resumen de IA más reciente generado para la sala. Accesible para cualquier usuario autenticado.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *     responses:
 *       200:
 *         description: Último resumen
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 id: "sum-1"
 *                 room_id: "8a1e...-room"
 *                 summary: "La sesión comenzó con..."
 *                 created_at: "2026-07-06T12:00:00.000Z"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Aún no hay resumen para esta sala
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Aún no hay resumen para esta sala" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Obtener el último resumen — cualquier miembro autenticado.
router.get('/:id/summary', requireAuth, async (req, res, next) => {
  try {
    const summary = await getLatestSummary(req.params.id)
    if (!summary) return fail(res, 'Aún no hay resumen para esta sala', 404)
    return ok(res, summary)
  } catch (err) {
    next(err)
  }
})

export default router