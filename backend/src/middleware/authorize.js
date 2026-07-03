const ROLE_RANK = { owner: 3, editor: 2, viewer: 1 }

export const requireRole = (minRole) => (req, res, next) => {
  const currentRole = req.user?.role

  if (!currentRole) {
    return res.status(403).json({
      ok: false,
      error: 'Permiso de sala requerido: envía un token de sala válido en x-room-token',
    })
  }

  if (ROLE_RANK[currentRole] >= ROLE_RANK[minRole]) {
    return next()
  }

  return res.status(403).json({
    ok: false,
    error: 'Rol insuficiente para esta acción',
    required: minRole,
    current: currentRole,
  })
}
