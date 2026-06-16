import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { uploadFile } from '../services/uploadService.js'
import { ok, errors } from '../lib/response.js'

const router = Router()

// Multer en memoria — el archivo no se guarda en disco
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Tipo de archivo no permitido'))
    }
  },
})

router.use(requireAuth)

/**
 * POST /api/upload
 * Form-data: file (archivo), room_id (string)
 */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { room_id } = req.body

    if (!room_id) {
      return errors.notFound(res, 'room_id requerido')
    }

    if (!req.file) {
      return errors.notFound(res, 'archivo requerido')
    }

    const spatialObject = await uploadFile(room_id, req.user.id, req.file)
    return ok(res, spatialObject, 201)

  } catch (err) {
    if (err.status === 403) return errors.forbidden(res)
    if (err.message === 'Tipo de archivo no permitido') {
      return res.status(400).json({ ok: false, error: err.message })
    }
    next(err)
  }
})

export default router