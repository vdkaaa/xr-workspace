/**
 * enforceHttps — redirige a HTTPS cuando NODE_ENV=production y la petición
 * llegó por HTTP (DGO-16).
 *
 * Railway termina el TLS en su edge/proxy y reenvía al contenedor por HTTP,
 * indicando el protocolo original del cliente en el header `x-forwarded-proto`.
 * Por eso no podemos usar req.secure directamente sin `trust proxy` configurado
 * en index.js.
 */
export const enforceHttps = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    return next()
  }

  const forwardedProto = req.headers['x-forwarded-proto']
  const isHttps = forwardedProto ? forwardedProto.split(',')[0].trim() === 'https' : req.secure

  if (isHttps) {
    return next()
  }

  return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
}
