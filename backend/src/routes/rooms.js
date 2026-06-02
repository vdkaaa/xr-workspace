import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { validate, createRoomSchema, updateRoomSchema } from '../validators/schemas.js'
import * as roomService from '../services/roomService.js'
import { ok, errors } from '../lib/response.js'

const router = Router()

// Todas las rutas de rooms requieren autenticación
router.use(requireAuth)

/**
 * GET /api/rooms
 * Lista las salas del usuario (propias + donde es miembro)
 */
router.get('/', async (req, res, next) => {
  try {
    const rooms = await roomService.listRooms(req.user.id)
    return ok(res, rooms)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/rooms
 * Body: { name, description?, max_users?, is_public? }
 * Crea una sala nueva y añade al creador como owner
 */
router.post('/', validate(createRoomSchema), async (req, res, next) => {
  try {
    const room = await roomService.createRoom(req.user.id, req.body)
    return ok(res, room, 201)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/rooms/:id
 * Devuelve el detalle de una sala (requiere acceso)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const room = await roomService.getRoom(req.params.id, req.user.id)
    return ok(res, room)
  } catch (err) {
    if (err.status === 404) return errors.notFound(res, 'Sala')
    if (err.status === 403) return errors.forbidden(res)
    next(err)
  }
})

/**
 * PATCH /api/rooms/:id
 * Body: campos a actualizar (solo el owner puede)
 */
router.patch('/:id', validate(updateRoomSchema), async (req, res, next) => {
  try {
    const room = await roomService.updateRoom(req.params.id, req.user.id, req.body)
    return ok(res, room)
  } catch (err) {
    if (err.status === 404) return errors.notFound(res, 'Sala')
    if (err.status === 403) return errors.forbidden(res)
    next(err)
  }
})

/**
 * DELETE /api/rooms/:id
 * Elimina la sala (solo el owner)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await roomService.deleteRoom(req.params.id, req.user.id)
    return ok(res, { deleted: true })
  } catch (err) {
    if (err.status === 404) return errors.notFound(res, 'Sala')
    if (err.status === 403) return errors.forbidden(res)
    next(err)
  }
})

/**
 * POST /api/rooms/:id/join
 * Une al usuario autenticado a la sala.
 * Valida: sala existe, capacidad (max 16), sala pública/privada.
 */
router.post('/:id/join', async (req, res, next) => {
  try {
    const result = await roomService.joinRoom(req.params.id, req.user.id)
    return ok(res, result)
  } catch (err) {
    if (err.status === 404) return errors.notFound(res, 'Sala')
    if (err.status === 403) return errors.forbidden(res)
    if (err.status === 409) return ok(res, null, 409) || res.status(409).json({ ok: false, error: err.message })
    next(err)
  }
})

export default router
