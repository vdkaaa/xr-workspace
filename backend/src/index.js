import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { redis } from './lib/redis.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(jwt, { secret: process.env.JWT_SECRET })
await fastify.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  redis,
  keyGenerator: (req) => req.user?.userId || req.ip,
})

import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import sessionRoutes from './routes/sessions.js'
import liveblocksRoutes from './routes/liveblocks.js'

fastify.register(authRoutes, { prefix: '/api/auth' })
fastify.register(roomRoutes, { prefix: '/api/rooms' })
fastify.register(sessionRoutes, { prefix: '/api/sessions' })
fastify.register(liveblocksRoutes, { prefix: '/api' })

fastify.get('/health', async () => ({ status: 'ok' }))

try {
  await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
