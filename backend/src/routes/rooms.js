import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/authorize.js'
import { validate, createRoomSchema, updateRoomSchema } from '../validators/schemas.js'
import * as roomService from '../services/roomService.js'
import * as snapshotService from '../services/snapshotService.js'
import * as sessionEventService from '../services/sessionEventService.js'
import { ok, errors } from '../lib/response.js'
import { authLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Todas las rutas de rooms requieren autenticación
router.use(requireAuth)

/**
 * @swagger
 * /api/rooms:
 *   get:
 *     tags: [Rooms]
 *     summary: Listar mis salas
 *     description: Devuelve las salas donde el usuario autenticado es owner o miembro.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de salas
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 - id: "8a1e...-room"
 *                   name: "Sala de diseño"
 *                   description: "Revisión semanal"
 *                   max_users: 16
 *                   is_public: false
 *                   owner_id: "b3f1..."
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
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
 * @swagger
 * /api/rooms:
 *   post:
 *     tags: [Rooms]
 *     summary: Crear una sala
 *     description: Crea una sala nueva y añade automáticamente al creador como miembro con rol `owner`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 80
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               max_users:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 16
 *                 default: 16
 *               is_public:
 *                 type: boolean
 *                 default: false
 *           example:
 *             name: Sala de diseño
 *             description: Revisión semanal del prototipo
 *             max_users: 8
 *             is_public: false
 *     responses:
 *       201:
 *         description: Sala creada
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data: { id: "8a1e...-room", name: "Sala de diseño", owner_id: "b3f1..." }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
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
 * @swagger
 * /api/rooms/{id}:
 *   get:
 *     tags: [Rooms]
 *     summary: Obtener detalle de una sala
 *     description: Devuelve la sala si el usuario es owner, miembro, o la sala es pública.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *     responses:
 *       200:
 *         description: Detalle de la sala
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data: { id: "8a1e...-room", name: "Sala de diseño", is_public: false, max_users: 16 }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
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
 * @swagger
 * /api/rooms/{id}:
 *   patch:
 *     tags: [Rooms]
 *     summary: Actualizar una sala
 *     description: Actualiza campos de la sala. Requiere ser el `owner` de la sala.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 80 }
 *               description: { type: string, maxLength: 500 }
 *               max_users: { type: integer, minimum: 1, maximum: 16 }
 *               is_public: { type: boolean }
 *           example:
 *             name: Sala de diseño (v2)
 *             is_public: true
 *     responses:
 *       200:
 *         description: Sala actualizada
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data: { id: "8a1e...-room", name: "Sala de diseño (v2)", is_public: true }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Solo el owner puede editar la sala
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Sin permisos para esta acción" }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
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
 * @swagger
 * /api/rooms/{id}:
 *   delete:
 *     tags: [Rooms]
 *     summary: Eliminar una sala
 *     description: |
 *       Elimina la sala definitivamente.
 *       **Rol requerido:** `owner` (vía `requireRole('owner')`, necesita `x-room-token`).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *       - name: x-room-token
 *         in: header
 *         required: true
 *         description: JWT de sala emitido por POST /api/rooms/{id}/join, con el rol del usuario.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sala eliminada
 *         content:
 *           application/json:
 *             example: { ok: true, data: { deleted: true } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Rol insuficiente (se requiere owner) o falta x-room-token
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Rol insuficiente para esta acción", required: "owner", current: "editor" }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.delete('/:id', requireRole('owner'), async (req, res, next) => {
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
 * @swagger
 * /api/rooms/{id}/join:
 *   post:
 *     tags: [Rooms]
 *     summary: Unirse a una sala
 *     description: |
 *       Une al usuario autenticado a la sala, validando capacidad (máx. 16) y visibilidad
 *       (pública/privada). Devuelve un `roomToken` (JWT) con el rol asignado, que debe
 *       enviarse luego en el header `x-room-token` para las rutas que usan `requireRole`.
 *
 *       Rate limit **estricto** (`authLimiter`): 10 requests por IP cada 15 minutos.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *     responses:
 *       200:
 *         description: Unión exitosa (o ya era miembro)
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 joined: true
 *                 already_member: false
 *                 room: { id: "8a1e...-room", max_users: 16, is_public: true }
 *                 roomToken: "eyJhbGciOiJIUzI1NiIs..."
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: La sala es privada y el usuario no está invitado
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Sin permisos para esta acción" }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: La sala está llena
 *         content:
 *           application/json:
 *             example: { ok: false, error: "La sala está llena (máximo 16 usuarios)" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/:id/join', authLimiter, async (req, res, next) => {
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

/**
 * @swagger
 * /api/rooms/{id}/snapshot:
 *   post:
 *     tags: [Snapshots]
 *     summary: Crear un snapshot manual
 *     description: |
 *       Captura el estado actual de la sala (objetos espaciales + estado de Liveblocks) y lo persiste.
 *       **Rol requerido:** `editor` o superior (owner también puede).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *       - name: x-room-token
 *         in: header
 *         required: true
 *         description: JWT de sala con el rol del usuario.
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Snapshot creado
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 snapshot: { id: "snap-1", room_id: "8a1e...-room", triggered_by: "manual" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Rol insuficiente (se requiere editor u owner)
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Rol insuficiente para esta acción", required: "editor" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/:id/snapshot', requireRole('editor'), async (req, res, next) => {
  try {
    const snapshot = await snapshotService.createSnapshot(req.params.id, 'manual')
    return ok(res, { snapshot }, 201)
  } catch (err) {
    next(err)
  }
})

/**
 * @swagger
 * /api/rooms/{id}/snapshots:
 *   get:
 *     tags: [Snapshots]
 *     summary: Listar snapshots de una sala
 *     description: Devuelve los últimos 20 snapshots de la sala, ordenados por fecha de creación descendente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *     responses:
 *       200:
 *         description: Lista de snapshots
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 snapshots:
 *                   - id: "snap-1"
 *                     room_id: "8a1e...-room"
 *                     triggered_by: "cron"
 *                     created_at: "2026-07-06T12:00:00.000Z"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/:id/snapshots', async (req, res, next) => {
  try {
    const snapshots = await snapshotService.listSnapshots(req.params.id, 20)
    return ok(res, { snapshots })
  } catch (err) {
    next(err)
  }
})

/**
 * @swagger
 * /api/rooms/{id}/history:
 *   get:
 *     tags: [Rooms]
 *     summary: Historial de eventos de la sala
 *     description: Devuelve el timeline de eventos (joins, leaves, cambios de objetos, snapshots, etc.) de la sala.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 50 }
 *         description: Cantidad máxima de eventos a devolver
 *       - name: before
 *         in: query
 *         schema: { type: string, format: date-time }
 *         description: Cursor de paginación (created_at); devuelve eventos anteriores a esta fecha
 *       - name: eventType
 *         in: query
 *         schema:
 *           type: string
 *           enum: [join, leave, object_add, object_delete, file_upload, snapshot]
 *         description: Filtra por tipo de evento
 *     responses:
 *       200:
 *         description: Timeline de eventos
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 events:
 *                   - id: "evt-1"
 *                     event_type: "join"
 *                     user_id: "b3f1..."
 *                     created_at: "2026-07-06T12:00:00.000Z"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/:id/history', async (req, res, next) => {
  try {
    const { limit, before, eventType } = req.query
    const events = await sessionEventService.getHistory(req.params.id, {
      limit: limit ? Number(limit) : undefined,
      before: before || null,
      eventType: eventType || null,
    })
    return ok(res, { events })
  } catch (err) {
    next(err)
  }
})

/**
 * @swagger
 * /api/rooms/{id}/leave:
 *   post:
 *     tags: [Rooms]
 *     summary: Salir de una sala
 *     description: Cierra explícitamente la sesión del usuario en la sala (registra el evento `leave` en el historial).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RoomId'
 *     responses:
 *       200:
 *         description: Salida registrada
 *         content:
 *           application/json:
 *             example: { ok: true, data: { left: true } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/:id/leave', async (req, res, next) => {
  try {
    await sessionEventService.trackEvent(req.params.id, req.user.id, 'leave', {
      user_id: req.user.id,
    })
    return ok(res, { left: true })
  } catch (err) {
    next(err)
  }
})

export default router
