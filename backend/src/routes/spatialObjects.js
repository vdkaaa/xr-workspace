import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/authorize.js'
import * as spatialObjectService from '../services/spatialObjectService.js'
import { ok, errors } from '../lib/response.js'

const router = Router()

router.use(requireAuth)

/**
 * GET /api/spatial-objects?room_id=X
 * Lista todos los objetos de una sala
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
 * POST /api/spatial-objects
 * Body: { room_id, type, position?, rotation?, scale?, content_url?, metadata? }
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
 * PATCH /api/spatial-objects/:id
 * Body: { position?, rotation?, scale?, metadata?, content_url? }
 * Usado por Unity cuando alguien mueve un objeto
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
 * DELETE /api/spatial-objects/:id
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