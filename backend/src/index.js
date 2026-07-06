import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import { createServer } from 'http'
import { initWebSocketServer } from './services/wsService.js'
import { logger } from './lib/logger.js'
import { swaggerSpec } from './lib/swagger.js'
import { docsGuard } from './middleware/docsGuard.js'
import authRouter from './routes/auth.js'
import roomsRouter from './routes/rooms.js'
import spatialObjectsRouter from './routes/spatialObjects.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { generalLimiter, authLimiter } from './middleware/rateLimiter.js'
import { enforceHttps } from './middleware/enforceHttps.js'
import { httpLogger } from './middleware/httpLogger.js'
import { errorTracker } from './middleware/errorTracker.js'
import uploadRouter from './routes/upload.js'
import liveblocksRouter from './routes/liveblocks.js';
import internalRouter from './routes/internal.js'
import livekitRoutes from './routes/livekit.js';
import summaryRoutes from './routes/summary.js'
import metricsRouter from './routes/metrics.js'

const app = express()
const PORT = process.env.PORT || 3000

// Railway corre detrás de un proxy/load balancer: confiamos en el primer hop
// para que req.ip / req.protocol / x-forwarded-* reflejen el cliente real
// (necesario para el rate limiting por IP y para detectar HTTPS correctamente).
app.set('trust proxy', 1)

// ─── Seguridad y parsing ──────────────────────────────────────────────────────

// Debe ir lo más temprano posible, antes de cualquier otro middleware.
app.use(enforceHttps)

app.use(helmet())

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (Postman, curl, Unity)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      const err = new Error(`CORS: origen no permitido: ${origin}`)
      err.isCorsError = true
      callback(err)
    }
  },
  credentials: true,
}))

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))


// ─── Logging y monitoring (DGO-17) ─────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use(httpLogger)
}

// Cuenta requests totales y errores 5xx; alerta si hay >5 errores 5xx en 5 min.
app.use(errorTracker)

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Definido en ./middleware/rateLimiter.js (DGO-16).

// General: 100 requests por IP cada 15 minutos, para todas las rutas /api/*
app.use('/api', generalLimiter)

// Estricto: 10 requests por IP cada 15 minutos, para rutas sensibles a fuerza bruta
app.use('/api/auth', authLimiter)

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'xr-rooms-backend',
    env: process.env.NODE_ENV,
    ts: new Date().toISOString(),
  })
})

// ─── Metrics ──────────────────────────────────────────────────────────────────

app.use('/api/metrics', metricsRouter)

// ─── API Docs (DGO-18) ──────────────────────────────────────────────────────────
// En producción exige ?key=<DOCS_KEY> (ver docsGuard.js).

app.use(
  '/api/docs',
  docsGuard,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, { customSiteTitle: 'XR Rooms Meet API Docs' }),
)

// ─── Rutas ────────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/spatial-objects', spatialObjectsRouter)
app.use('/api/upload', uploadRouter)
app.use('/api/liveblocks', liveblocksRouter);
app.use('/api/internal', internalRouter)
app.use('/api/livekit', livekitRoutes);
app.use('/api/rooms', summaryRoutes)

// ─── Error handlers ───────────────────────────────────────────────────────────

app.use(notFoundHandler)
app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────────────────

const server = createServer(app)

if (process.env.NODE_ENV !== 'test') {
  initWebSocketServer(server)

  server.listen(PORT, () => {
    logger.info(
      { port: PORT, env: process.env.NODE_ENV || 'development' },
      `🚀 XR Rooms Backend corriendo en http://localhost:${PORT}`,
    )
  })
}

export default app
