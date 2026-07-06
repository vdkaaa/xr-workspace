import pino from 'pino'

// DGO-17 — Logger estructurado central.
//
// - Desarrollo: salida legible por humanos vía pino-pretty.
// - Producción: JSON plano en stdout, para que Railway (y drains como
//   Logtail/Better Stack) lo puedan parsear e indexar directamente.
//
// El middleware pino-http (ver src/middleware/httpLogger.js) crea un logger
// hijo por request que agrega automáticamente userId/roomId cuando existen
// (req.user / req.params). Este `logger` base es el que se usa en services
// y rutas donde no hay un `req` a mano.

const isProd = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
})

export default logger
