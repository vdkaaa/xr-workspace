import jwt from 'jsonwebtoken'
import { supabase } from '../lib/supabase.js'
import { errors } from '../lib/response.js'

/**
 * requireAuth — verifica el JWT de Supabase en el header Authorization.
 * Si es válido, adjunta el user a req.user y continúa.
 * Si no, responde 401.
 *
 * Uso: router.get('/ruta', requireAuth, handler)
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      return errors.unauthorized(res)
    }

    const token = authHeader.split(' ')[1]

    // Verificar el token contra Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return errors.unauthorized(res)
    }

    // Adjuntar usuario al request para uso posterior
    req.user = user
    req.token = token

    const roomToken = req.headers['x-room-token']
    if (roomToken) {
      try {
        const decoded = jwt.verify(roomToken, process.env.JWT_SECRET)
        if (decoded.sub === req.user.id) {
          req.user.role = decoded.role
          req.user.room_id = decoded.room_id
        }
      } catch {
        // El token de sala es opcional aquí; requireRole lo rechazará si hace falta.
      }
    }

    next()
  } catch (err) {
    return errors.serverError(res, err)
  }
}

/**
 * optionalAuth — igual que requireAuth pero no bloquea si no hay token.
 * Útil para rutas públicas que tienen comportamiento diferente si hay sesión.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      req.user = null
      return next()
    }

    const token = authHeader.split(' ')[1]
    const { data: { user } } = await supabase.auth.getUser(token)

    req.user = user || null
    req.token = token
    next()
  } catch {
    req.user = null
    next()
  }
}
