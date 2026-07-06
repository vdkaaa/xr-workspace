import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/authorize.js'
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
 * @swagger
 * /api/upload:
 *   post:
 *     tags: [Upload]
 *     summary: Subir un archivo a una sala
 *     description: |
 *       Sube una imagen (jpeg/png/gif/webp) o PDF, máximo 10MB, y lo registra como
 *       objeto espacial en la sala.
 *       **Rol requerido:** `editor` o superior.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: x-room-token
 *         in: header
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, room_id]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               room_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Archivo subido y objeto espacial creado
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data: { id: "obj-2", room_id: "8a1e...-room", type: "file", content_url: "https://.../archivo.png" }
 *       400:
 *         description: Tipo de archivo no permitido
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Tipo de archivo no permitido" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Falta room_id o el archivo en el form-data
 *         content:
 *           application/json:
 *             example: { ok: false, error: "archivo requerido no encontrado" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/', requireRole('editor'), upload.single('file'), async (req, res, next) => {
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