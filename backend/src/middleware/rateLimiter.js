import rateLimit from 'express-rate-limit'
import { fail } from '../lib/response.js'

/**
 * rateLimiter — límites de peticiones por IP (DGO-16).
 * Usa el formato de respuesta estándar de src/lib/response.js para
 * que el cliente reciba siempre la misma forma de error ({ ok, error }).
 */

const rateLimitHandler = (message) => (req, res) => {
  return fail(res, message, 429)
}

/**
 * generalLimiter — límite global para todas las rutas /api/*.
 * 100 requests por IP cada 15 minutos.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Demasiadas peticiones, intenta más tarde'),
})

/**
 * authLimiter — límite estricto para rutas sensibles a fuerza bruta:
 * POST /api/auth/* y POST /api/rooms/:id/join.
 * 10 requests por IP cada 15 minutos.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Demasiados intentos, intenta más tarde'),
})
