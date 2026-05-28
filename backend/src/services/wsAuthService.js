import { redis } from '../lib/redis.js'
import { randomUUID } from 'crypto'

export async function generateWsTicket(roomId, userId, role) {
  const ticketId = randomUUID()
  const key = `ws:ticket:${ticketId}`
  await redis.setex(key, 30, JSON.stringify({ roomId, userId, role }))
  return ticketId
}

export async function validateWsTicket(ticketId) {
  const key = `ws:ticket:${ticketId}`
  const raw = await redis.get(key)
  if (!raw) throw new Error('Invalid or expired ticket')
  await redis.del(key) // uso único
  return JSON.parse(raw)
}

export async function checkWsRateLimit(userId) {
  const key = `ratelimit:ws:${userId}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, 60)
  if (count > 10) throw new Error('Too many connection attempts')
}
