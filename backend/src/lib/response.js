import { logger } from './logger.js'

// Respuesta exitosa
export const ok = (res, data, status = 200) => {
  return res.status(status).json({ ok: true, data })
}

// Respuesta de error
export const fail = (res, message, status = 400, details = null) => {
  const body = { ok: false, error: message }
  if (details) body.details = details
  return res.status(status).json(body)
}

// Errores comunes reutilizables
export const errors = {
  unauthorized: (res) => fail(res, 'No autenticado', 401),
  forbidden: (res) => fail(res, 'Sin permisos para esta acción', 403),
  notFound: (res, resource = 'Recurso') => fail(res, `${resource} no encontrado`, 404),
  serverError: (res, err) => {
    logger.error({ err }, '[SERVER ERROR]')
    return fail(res, 'Error interno del servidor', 500)
  },
}
