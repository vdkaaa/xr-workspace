import pinoHttp from 'pino-http'
import { logger } from '../lib/logger.js'

/**
 * httpLogger — loguea automáticamente cada request (DGO-17):
 * método, ruta, status code y tiempo de respuesta.
 *
 * customProps agrega userId/roomId a la línea de log final cuando existen
 * en el request (p. ej. userId lo setea requireAuth, roomId suele venir
 * en req.params.id o en el body de /liveblocks/auth).
 */
export const httpLogger = pinoHttp({
  logger,
  customProps: (req) => {
    const props = {}

    if (req.user?.id) props.userId = req.user.id

    const roomId = req.params?.id || req.params?.roomId || req.body?.room
    if (roomId) props.roomId = roomId

    return props
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
})
