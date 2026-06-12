import { WebSocketServer } from 'ws'
import { Liveblocks } from '@liveblocks/node'


// Map de conexiones activas: roomId → Set de WebSockets
const rooms = new Map()

/**
 * initWebSocketServer — inicializa el servidor WebSocket
 * y lo adjunta al servidor HTTP de Express
 */
export const initWebSocketServer = (server) => {
  const liveblocks = new Liveblocks({
    secret: process.env.LIVEBLOCKS_SECRET_KEY,
  })
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws, req) => {
    // Extraer token y roomId de los query params
    const url = new URL(req.url, `http://${req.headers.host}`)
    const token = url.searchParams.get('token')
    const roomId = url.searchParams.get('room_id')

    if (!token || !roomId) {
      ws.close(1008, 'token y room_id requeridos')
      return
    }

    // Registrar la conexión en el room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set())
    }
    rooms.get(roomId).add(ws)

    console.log(`[WS] Cliente conectado a sala ${roomId}. Total: ${rooms.get(roomId).size}`)

    // Manejar mensajes entrantes desde Unity
    ws.on('message', async (raw) => {
      try {
        const message = JSON.parse(raw.toString())
        const { type, data } = message

        console.log(`[WS] Evento recibido: ${type}`)

        // Reenviar a Liveblocks para que los clientes web lo vean
        await liveblocks.broadcastEvent(roomId, { type, data })

        // Reenviar a otros clientes WebSocket conectados a la misma sala
        broadcastToRoom(roomId, message, ws)

      } catch (err) {
        console.error('[WS] Error procesando mensaje:', err)
      }
    })

    // Limpiar cuando se desconecta
    ws.on('close', () => {
      rooms.get(roomId)?.delete(ws)
      if (rooms.get(roomId)?.size === 0) {
        rooms.delete(roomId)
      }
      console.log(`[WS] Cliente desconectado de sala ${roomId}`)
    })

    ws.on('error', (err) => {
      console.error('[WS] Error:', err)
    })

    // Confirmar conexión al cliente
    ws.send(JSON.stringify({ type: 'CONNECTED', data: { roomId } }))
  })

  console.log('[WS] WebSocket server inicializado')
  return wss
}

/**
 * broadcastToRoom — envía un mensaje a todos los clientes
 * de una sala excepto al emisor
 */
const broadcastToRoom = (roomId, message, sender) => {
  const clients = rooms.get(roomId)
  if (!clients) return

  const raw = JSON.stringify(message)
  clients.forEach((client) => {
    if (client !== sender && client.readyState === 1) {
      client.send(raw)
    }
  })
}