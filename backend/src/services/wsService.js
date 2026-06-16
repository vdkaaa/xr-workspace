import { WebSocketServer } from 'ws'
import { Liveblocks } from '@liveblocks/node'
import { trackEvent } from './sessionEventService.js'

const rooms = new Map()

// Lazy init — evita que falle si LIVEBLOCKS_SECRET_KEY no está en CI
let _liveblocks = null
function getLiveblocks() {
  if (!_liveblocks) {
    if (!process.env.LIVEBLOCKS_SECRET_KEY) {
      throw new Error('LIVEBLOCKS_SECRET_KEY no definida')
    }
    _liveblocks = new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY })
  }
  return _liveblocks
}

export const initWebSocketServer = (server) => {
  const wss = new WebSocketServer({ server })  // ← saca liveblocks de acá

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const token = url.searchParams.get('token')
    const roomId = url.searchParams.get('room_id')
    const userId = url.searchParams.get('user_id')

    if (!token || !roomId) {
      ws.close(1008, 'token y room_id requeridos')
      return
    }

    if (!rooms.has(roomId)) rooms.set(roomId, new Set())
    rooms.get(roomId).add(ws)
    console.log(`[WS] Cliente conectado a sala ${roomId}. Total: ${rooms.get(roomId).size}`)

    // Registrar el join (fire-and-forget) — la conexión WS no viene de HTTP
    const connectedAt = Date.now()
    trackEvent(roomId, userId, 'join', { source: 'ws' })

    ws.on('message', async (raw) => {
      try {
        const message = JSON.parse(raw.toString())
        const { type, data } = message
        console.log(`[WS] Evento recibido: ${type}`)

        await getLiveblocks().broadcastEvent(roomId, { type, data })  // ← lazy aquí
        broadcastToRoom(roomId, message, ws)
      } catch (err) {
        console.error('[WS] Error procesando mensaje:', err)
      }
    })

    ws.on('close', () => {
      rooms.get(roomId)?.delete(ws)
      if (rooms.get(roomId)?.size === 0) rooms.delete(roomId)
      console.log(`[WS] Cliente desconectado de sala ${roomId}`)

      const durationSeconds = Math.round((Date.now() - connectedAt) / 1000)
      trackEvent(roomId, userId, 'leave', { duration_seconds: durationSeconds })
    })

    ws.on('error', (err) => console.error('[WS] Error:', err))

    ws.send(JSON.stringify({ type: 'CONNECTED', data: { roomId } }))
  })

  console.log('[WS] WebSocket server inicializado')
  return wss
}

const broadcastToRoom = (roomId, message, sender) => {
  const clients = rooms.get(roomId)
  if (!clients) return
  const raw = JSON.stringify(message)
  clients.forEach((client) => {
    if (client !== sender && client.readyState === 1) client.send(raw)
  })
}