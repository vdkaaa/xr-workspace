import { logger } from '../lib/logger.js'

// DGO-17 — Conteo de errores 5xx y alerta básica.
//
// Estado en memoria (por proceso). Si el backend corre con más de una
// instancia/réplica en Railway, cada una lleva su propio contador; para
// alertas agregadas entre instancias habría que mover esto a un store
// compartido (Redis, etc.), pero para el volumen actual esto es suficiente.

const WINDOW_MS = 5 * 60 * 1000
const ALERT_THRESHOLD = 5

let totalRequests = 0
let total5xxErrors = 0
let recentErrorTimestamps = []

const pruneOldTimestamps = (now) => {
  recentErrorTimestamps = recentErrorTimestamps.filter((t) => now - t <= WINDOW_MS)
}

/**
 * errorTracker — middleware global. Cuenta cada request y, si la respuesta
 * termina en 5xx, la registra. Si se superan 5 errores 5xx en los últimos
 * 5 minutos, loguea a nivel "fatal" con { ALERT: true } para poder
 * conectarlo después a un webhook de Discord/Slack.
 */
export const errorTracker = (req, res, next) => {
  totalRequests += 1

  res.on('finish', () => {
    if (res.statusCode >= 500) {
      total5xxErrors += 1

      const now = Date.now()
      recentErrorTimestamps.push(now)
      pruneOldTimestamps(now)

      if (recentErrorTimestamps.length > ALERT_THRESHOLD) {
        logger.fatal(
          {
            ALERT: true,
            count: recentErrorTimestamps.length,
            windowMinutes: WINDOW_MS / 60_000,
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
          },
          `Umbral de errores 5xx superado: ${recentErrorTimestamps.length} errores en los últimos 5 minutos`,
        )
      }
    }
  })

  next()
}

/**
 * getErrorTrackerMetrics — snapshot de los contadores para /api/metrics.
 */
export const getErrorTrackerMetrics = () => {
  pruneOldTimestamps(Date.now())
  return {
    totalRequests,
    total5xxErrors,
    recent5xxErrors: recentErrorTimestamps.length,
  }
}
