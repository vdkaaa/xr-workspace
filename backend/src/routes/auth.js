import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { validate, registerSchema, loginSchema } from '../validators/schemas.js'
import * as authService from '../services/authService.js'
import { ok, fail } from '../lib/response.js'

const router = Router()

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Registrar un nuevo usuario
 *     description: Crea una cuenta de usuario en Supabase Auth. Sujeto al rate limit estricto (authLimiter).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               name:
 *                 type: string
 *                 minLength: 2
 *           example:
 *             email: usuaria@example.com
 *             password: unaPasswordSegura123
 *             name: Ana
 *     responses:
 *       201:
 *         description: Usuario creado
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 user: { id: "b3f1...", email: "usuaria@example.com" }
 *                 session: { access_token: "eyJ...", refresh_token: "..." }
 *       409:
 *         description: El email ya está registrado
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Este email ya está registrado" }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
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
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesión
 *     description: Autentica al usuario contra Supabase Auth y devuelve la sesión (tokens). Sujeto al rate limit estricto (authLimiter) — protección contra fuerza bruta.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *           example:
 *             email: usuaria@example.com
 *             password: unaPasswordSegura123
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 user: { id: "b3f1...", email: "usuaria@example.com" }
 *                 session: { access_token: "eyJ...", refresh_token: "..." }
 *       401:
 *         description: Credenciales incorrectas
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Email o contraseña incorrectos" }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
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
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Obtener el usuario autenticado
 *     description: Devuelve los datos del usuario asociado al JWT enviado.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuario actual
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data: { id: "b3f1...", email: "usuaria@example.com", name: "Ana" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/me', requireAuth, (req, res) => {
  return ok(res, authService.getMe(req.user))
})

export default router
