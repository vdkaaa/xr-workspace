import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/authorize.js'
import * as spatialObjectService from '../services/spatialObjectService.js'
import { ok, errors } from '../lib/response.js'

const router = Router()

router.use(requireAuth)

/**
 * @swagger
 * /api/spatial-objects:
 *   get:
 *     tags: [Spatial Objects]
 *     summary: Listar objetos espaciales de una sala
 *     description: Devuelve todos los objetos 3D (modelos, imágenes, pizarrones, etc.) de una sala.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: room_id
 *         in: query
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: UUID de la sala
 *     responses:
 *       200:
 *         description: Lista de objetos espaciales
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 - id: "obj-1"
 *                   room_id: "8a1e...-room"
 *                   type: "model3d"
 *                   position: { x: 0, y: 1, z: 0 }
 *       404:
 *         description: Falta el query param room_id (el handler usa el helper notFound para este caso)
 *         content:
 *           application/json:
 *             example: { ok: false, error: "room_id requerido no encontrado" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/', async (req, res, next) => {
  try {
    const { room_id } = req.query
    if (!room_id) return errors.notFound(res, 'room_id requerido')
    const objects = await spatialObjectService.listSpatialObjects(room_id, req.user.id)
    return ok(res, objects)
  } catch (err) {
    if (err.status === 403) return errors.forbidden(res)
    next(err)
  }
})

/**
 * @swagger
 * /api/spatial-objects:
 *   post:
 *     tags: [Spatial Objects]
 *     summary: Crear un objeto espacial
 *     description: |
 *       Crea un objeto 3D dentro de una sala.
 *       **Rol requerido:** `editor` o superior.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: x-room-token
 *         in: header
 *         required: true
 *         schema: { type: string }
 *         description: JWT de sala con el rol del usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [room_id, type]
 *             properties:
 *               room_id: { type: string, format: uuid }
 *               type: { type: string, example: model3d }
 *               position: { type: object, example: { x: 0, y: 1, z: 0 } }
 *               rotation: { type: object, example: { x: 0, y: 0, z: 0 } }
 *               scale: { type: object, example: { x: 1, y: 1, z: 1 } }
 *               content_url: { type: string, format: uri }
 *               metadata: { type: object }
 *           example:
 *             room_id: "8a1e...-room"
 *             type: model3d
 *             position: { x: 0, y: 1, z: 0 }
 *     responses:
 *       201:
 *         description: Objeto creado
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data: { id: "obj-1", room_id: "8a1e...-room", type: "model3d" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Falta room_id o type en el body
 *         content:
 *           application/json:
 *             example: { ok: false, error: "type requerido no encontrado" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/', requireRole('editor'), async (req, res, next) => {
  try {
    const { room_id, ...payload } = req.body
    if (!room_id) return errors.notFound(res, 'room_id requerido')
    if (!payload.type) return errors.notFound(res, 'type requerido')
    const obj = await spatialObjectService.createSpatialObject(room_id, req.user.id, payload)
    return ok(res, obj, 201)
  } catch (err) {
    if (err.status === 403) return errors.forbidden(res)
    next(err)
  }
})

/**
 * @swagger
 * /api/spatial-objects/{id}:
 *   patch:
 *     tags: [Spatial Objects]
 *     summary: Actualizar un objeto espacial
 *     description: |
 *       Actualiza posición/rotación/escala/metadata de un objeto. Usado por Unity cuando
 *       alguien mueve un objeto en la escena.
 *       **Rol requerido:** `editor` o superior.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: UUID del objeto espacial
 *       - name: x-room-token
 *         in: header
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               position: { type: object, example: { x: 1, y: 1, z: 0 } }
 *               rotation: { type: object }
 *               scale: { type: object }
 *               metadata: { type: object }
 *               content_url: { type: string, format: uri }
 *     responses:
 *       200:
 *         description: Objeto actualizado
 *         content:
 *           application/json:
 *             example: { ok: true, data: { id: "obj-1", position: { x: 1, y: 1, z: 0 } } }
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
router.patch('/:id', requireRole('editor'), async (req, res, next) => {
  try {
    const obj = await spatialObjectService.updateSpatialObject(
      req.params.id,
      req.user.id,
      req.body
    )
    return ok(res, obj)
  } catch (err) {
    if (err.status === 404) return errors.notFound(res, 'Objeto')
    if (err.status === 403) return errors.forbidden(res)
    next(err)
  }
})

/**
 * @swagger
 * /api/spatial-objects/{id}:
 *   delete:
 *     tags: [Spatial Objects]
 *     summary: Eliminar un objeto espacial
 *     description: |
 *       **Rol requerido:** `editor` o superior.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: x-room-token
 *         in: header
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Objeto eliminado
 *         content:
 *           application/json:
 *             example: { ok: true, data: { deleted: true } }
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
router.delete('/:id', requireRole('editor'), async (req, res, next) => {
  try {
    await spatialObjectService.deleteSpatialObject(req.params.id, req.user.id)
    return ok(res, { deleted: true })
  } catch (err) {
    if (err.status === 404) return errors.notFound(res, 'Objeto')
    if (err.status === 403) return errors.forbidden(res)
    next(err)
  }
})

export default router