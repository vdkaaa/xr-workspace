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

const router = Router({ mergeParams: true })

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
      console.error('[summary] error generando resumen:', err)
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: 'Error generando el resumen' })}\n\n`,
      )
      res.end()
    }
  },
)

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