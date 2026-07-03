import { requireRole } from '../authorize.js'

const mockResponse = () => {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

describe('requireRole', () => {
  it('permite owner cuando se requiere editor', () => {
    const req = { user: { role: 'owner' } }
    const res = mockResponse()
    const next = jest.fn()

    requireRole('editor')(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('bloquea viewer cuando se requiere editor', () => {
    const req = { user: { role: 'viewer' } }
    const res = mockResponse()
    const next = jest.fn()

    requireRole('editor')(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'Rol insuficiente para esta acción',
      required: 'editor',
      current: 'viewer',
    })
  })

  it('bloquea req.user sin role y menciona token de sala', () => {
    const req = { user: {} }
    const res = mockResponse()
    const next = jest.fn()

    requireRole('editor')(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json.mock.calls[0][0].error).toMatch(/token de sala/i)
  })
})
