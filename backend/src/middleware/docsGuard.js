import { logger } from '../lib/logger.js'

const COOKIE_NAME = 'docs_key'
const COOKIE_MAX_AGE_MS = 60 * 60 * 1000 // 1h

/**
 * parseCookies — parser mínimo, evita traer cookie-parser solo para esto.
 */
const parseCookies = (req) => {
  const header = req.headers.cookie
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const [key, ...rest] = pair.trim().split('=')
      return [key, decodeURIComponent(rest.join('='))]
    }),
  )
}

/**
 * docsGuard — protege GET /api/docs (DGO-18).
 *
 * En desarrollo: acceso libre.
 * En producción: exige ?key=<DOCS_KEY>. Swagger UI carga sus assets
 * (css/js) con URLs relativas que NO heredan el query string, así que tras
 * validar la key una vez, la guardamos en una cookie httpOnly de corta
 * duración para que esas requests subsiguientes (que sí incluyen cookies)
 * también pasen — si no, la UI quedaría rota (sin estilos ni el spec).
 */
export const docsGuard = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    return next()
  }

  const docsKey = process.env.DOCS_KEY
  if (!docsKey) {
    logger.warn('[docs] DOCS_KEY no configurada — /api/docs bloqueado en producción')
    return res.status(401).json({ ok: false, error: 'Documentación no disponible' })
  }

  const cookies = parseCookies(req)
  const providedKey = req.query.key || cookies[COOKIE_NAME]

  if (providedKey !== docsKey) {
    return res.status(401).json({ ok: false, error: 'No autorizado' })
  }

  res.cookie(COOKIE_NAME, docsKey, {
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
    maxAge: COOKIE_MAX_AGE_MS,
  })

  next()
}
