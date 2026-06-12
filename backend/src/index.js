import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { createServer } from 'http'
import { initWebSocketServer } from './services/wsService.js'
import authRouter from './routes/auth.js'
import roomsRouter from './routes/rooms.js'
import spatialObjectsRouter from './routes/spatialObjects.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

const app = express()
const PORT = process.env.PORT || 3000

// ─── Seguridad y parsing ──────────────────────────────────────────────────────

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
      callback(new Error(`CORS: origen no permitido: ${origin}`))
    }
  },
  credentials: true,
}))

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))


// ─── Logging ──────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'))
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

// General: 100 requests por 15 minutos
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas peticiones, intenta más tarde' },
})

// Auth: 10 intentos por 15 minutos (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos de autenticación' },
})

app.use('/api', generalLimiter)
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

// ─── Rutas ────────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/spatial-objects', spatialObjectsRouter)

// ─── Error handlers ───────────────────────────────────────────────────────────

app.use(notFoundHandler)
app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────────────────

const server = createServer(app)
initWebSocketServer(server)

server.listen(PORT, () => {
  console.log(`\n🚀 XR Rooms Backend corriendo en http://localhost:${PORT}`)
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`)
  console.log(`   Health:  http://localhost:${PORT}/health\n`)
})

export default app
