import { z } from 'zod'

// ─── Auth ────────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').optional(),
})

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

// ─── Rooms ───────────────────────────────────────────────────────────────────

export const createRoomSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(80, 'Máximo 80 caracteres'),
  description: z.string().max(500).optional(),
  max_users: z.number().int().min(1).max(16).default(16),
  is_public: z.boolean().default(false),
})

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  max_users: z.number().int().min(1).max(16).optional(),
  is_public: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Debes enviar al menos un campo para actualizar',
})

// ─── Helper para usar en rutas ────────────────────────────────────────────────

/**
 * validate(schema) — middleware que valida req.body con el schema Zod dado.
 * En caso de error lanza al errorHandler global.
 */
export const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body)
    next()
  } catch (err) {
    next(err)
  }
}
