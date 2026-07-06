import { ZodError } from 'zod'
import { fail } from '../lib/response.js'
import { logger } from '../lib/logger.js'

/**
 * errorHandler — middleware global de manejo de errores.
 * Va al final de todos los middlewares en index.js
 */
export const errorHandler = (err, req, res, next) => {
  // Error de CORS (origen no permitido) — rechazar explícitamente, no solo loguear
  if (err?.isCorsError) {
    logger.warn({ err }, '[CORS] Origen rechazado')
    return fail(res, 'Origen no permitido', 403)
  }

  // Error de validación Zod
  if (err instanceof ZodError) {
    return fail(res, 'Datos inválidos', 422, err.flatten().fieldErrors)
  }

  // Error de Supabase
  if (err?.code && err?.message) {
    logger.error({ err }, '[SUPABASE ERROR]')
    return fail(res, err.message, 400)
  }

  // Error genérico
  logger.error({ err }, '[UNHANDLED ERROR]')
  return res.status(500).json({
    ok: false,
    error: 'Error interno del servidor',
  })
}

/**
 * notFoundHandler — responde 404 para rutas no definidas
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.path}`,
  })
}
