import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { validate, registerSchema, loginSchema } from '../validators/schemas.js'
import * as authService from '../services/authService.js'
import { ok, fail, errors } from '../lib/response.js'

const router = Router()

/**
 * POST /api/auth/register
 * Body: { email, password, name? }
 */
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const data = await authService.register(req.body)
    return ok(res, data, 201)
  } catch (err) {
    // Supabase devuelve 'User already registered' como error
    if (err.message?.includes('already registered')) {
      return fail(res, 'Este email ya está registrado', 409)
    }
    next(err)
  }
})

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Devuelve: { session: { access_token, refresh_token, ... }, user }
 */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const data = await authService.login(req.body)
    return ok(res, data)
  } catch (err) {
    if (err.message?.includes('Invalid login credentials')) {
      return fail(res, 'Email o contraseña incorrectos', 401)
    }
    next(err)
  }
})

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 * Devuelve el usuario autenticado
 */
router.get('/me', requireAuth, (req, res) => {
  return ok(res, authService.getMe(req.user))
})

export default router
