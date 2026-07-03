/**
 * rooms.test.js — Tests completos para /api/rooms
 */

jest.mock('../../lib/supabase.js')

import { supabase, supabaseAdmin } from '../../lib/supabase.js'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import app from '../../index.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uuid = (n = 1) => `00000000-0000-0000-0000-00000000000${n}`
const AUTH_USER = { id: uuid(99), email: 'diego@test.com' }
const FAKE_TOKEN = 'Bearer fake-jwt-token'
const TEST_JWT_SECRET = 'test-jwt-secret'
const roomToken = (role = 'owner', roomId = uuid(1)) =>
  jwt.sign({ sub: AUTH_USER.id, room_id: roomId, role }, TEST_JWT_SECRET)

const mockRoom = (o = {}) => ({
  id: uuid(1), name: 'Test Room', description: null,
  max_users: 16, is_public: true, spatial_state: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  owner_id: uuid(99), ...o,
})

const dbQueue = []
const db = (...results) => dbQueue.push(...results)

const consumeNext = () => {
  const next = dbQueue.shift()
  return Promise.resolve(next ?? { data: null, error: null })
}

const withAuth = () => {
  supabase.auth.getUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null })
}

beforeEach(() => {
  jest.clearAllMocks()
  dbQueue.length = 0
  process.env.JWT_SECRET = TEST_JWT_SECRET

  supabase.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'no auth' },
  })

  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    single: jest.fn().mockImplementation(consumeNext),
    then: (resolve, reject) => consumeNext().then(resolve, reject),
  }

  supabaseAdmin.from.mockReturnValue(chain)
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/rooms
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/rooms', () => {
  it('401 sin token', async () => {
    const { status, body } = await request(app).get('/api/rooms')
    expect(status).toBe(401)
    expect(body.ok).toBe(false)
  })

  it('401 token inválido', async () => {
    const { status } = await request(app)
      .get('/api/rooms').set('Authorization', 'Token bad')
    expect(status).toBe(401)
  })

  it('401 token rechazado por Supabase', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null }, error: { message: 'JWT expired' },
    })
    expect((await request(app).get('/api/rooms')
      .set('Authorization', FAKE_TOKEN)).status).toBe(401)
  })

  it('200 con lista de salas', async () => {
    withAuth()
    db({ data: [mockRoom()], error: null }, { data: [], error: null })
    const { status, body } = await request(app)
      .get('/api/rooms').set('Authorization', FAKE_TOKEN)
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('200 array vacío si no tiene salas', async () => {
    withAuth()
    db({ data: [], error: null }, { data: [], error: null })
    const { status, body } = await request(app)
      .get('/api/rooms').set('Authorization', FAKE_TOKEN)
    expect(status).toBe(200)
    expect(body.data).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/rooms
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/rooms', () => {
  const valid = { name: 'Mi sala XR', max_users: 8, is_public: true }

  it('401 sin token', async () => {
    expect((await request(app).post('/api/rooms').send(valid)).status).toBe(401)
  })

  it('422 sin name', async () => {
    withAuth()
    const { status, body } = await request(app)
      .post('/api/rooms').set('Authorization', FAKE_TOKEN).send({ max_users: 8 })
    expect(status).toBe(422)
    expect(body.ok).toBe(false)
  })

  it('422 max_users > 16 rechazado por Zod', async () => {
    withAuth()
    expect((await request(app).post('/api/rooms')
      .set('Authorization', FAKE_TOKEN)
      .send({ name: 'Test', max_users: 99 })).status).toBe(422)
  })

  it('422 name vacío', async () => {
    withAuth()
    expect((await request(app).post('/api/rooms')
      .set('Authorization', FAKE_TOKEN).send({ name: '' })).status).toBe(422)
  })

  it('201 crea sala correctamente', async () => {
    withAuth()
    const created = mockRoom({ name: valid.name, owner_id: AUTH_USER.id })
    db({ data: created, error: null }, { data: null, error: null })
    const { status, body } = await request(app)
      .post('/api/rooms').set('Authorization', FAKE_TOKEN).send(valid)
    expect(status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.data.name).toBe(valid.name)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/rooms/:id
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/rooms/:id', () => {
  it('401 sin token', async () => {
    expect((await request(app).get(`/api/rooms/${uuid(1)}`)).status).toBe(401)
  })

  it('404 sala no existe', async () => {
    withAuth()
    db({ data: null, error: { code: 'PGRST116' } })
    expect((await request(app).get(`/api/rooms/${uuid(1)}`)
      .set('Authorization', FAKE_TOKEN)).status).toBe(404)
  })

  it('403 sala privada usuario no es miembro', async () => {
    withAuth()
    const room = mockRoom({ is_public: false, owner_id: uuid(50) })
    db({ data: room, error: null }, { data: null, error: null })
    expect((await request(app).get(`/api/rooms/${room.id}`)
      .set('Authorization', FAKE_TOKEN)).status).toBe(403)
  })

  it('200 sala pública', async () => {
    withAuth()
    const room = mockRoom({ is_public: true })
    db({ data: room, error: null })
    const { status, body } = await request(app)
      .get(`/api/rooms/${room.id}`).set('Authorization', FAKE_TOKEN)
    expect(status).toBe(200)
    expect(body.data.id).toBe(room.id)
  })

  it('200 sala privada accedida por el owner', async () => {
    withAuth()
    const room = mockRoom({ is_public: false, owner_id: AUTH_USER.id })
    db({ data: room, error: null })
    expect((await request(app).get(`/api/rooms/${room.id}`)
      .set('Authorization', FAKE_TOKEN)).status).toBe(200)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/rooms/:id
// ══════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/rooms/:id', () => {
  it('401 sin token', async () => {
    expect((await request(app).patch(`/api/rooms/${uuid(1)}`).send({ name: 'x' })).status).toBe(401)
  })

  it('422 body vacío', async () => {
    withAuth()
    expect((await request(app).patch(`/api/rooms/${uuid(1)}`)
      .set('Authorization', FAKE_TOKEN).send({})).status).toBe(422)
  })

  it('422 max_users > 16', async () => {
    withAuth()
    expect((await request(app).patch(`/api/rooms/${uuid(1)}`)
      .set('Authorization', FAKE_TOKEN).send({ max_users: 50 })).status).toBe(422)
  })

  it('403 usuario no es owner', async () => {
    withAuth()
    db({ data: { owner_id: uuid(50) }, error: null })
    expect((await request(app).patch(`/api/rooms/${uuid(1)}`)
      .set('Authorization', FAKE_TOKEN).send({ name: 'Nuevo' })).status).toBe(403)
  })

  it('404 sala no existe', async () => {
    withAuth()
    db({ data: null, error: { code: 'PGRST116' } })
    expect((await request(app).patch(`/api/rooms/${uuid(1)}`)
      .set('Authorization', FAKE_TOKEN).send({ name: 'Nuevo' })).status).toBe(404)
  })

  it('200 actualiza sala si usuario es owner', async () => {
    withAuth()
    const updated = mockRoom({ name: 'Actualizado', owner_id: AUTH_USER.id })
    db({ data: { owner_id: AUTH_USER.id }, error: null }, { data: updated, error: null })
    const { status, body } = await request(app)
      .patch(`/api/rooms/${uuid(1)}`).set('Authorization', FAKE_TOKEN)
      .send({ name: 'Actualizado' })
    expect(status).toBe(200)
    expect(body.data.name).toBe('Actualizado')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/rooms/:id
// ══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/rooms/:id', () => {
  it('401 sin token', async () => {
    expect((await request(app).delete(`/api/rooms/${uuid(1)}`)).status).toBe(401)
  })

  it('404 sala no existe', async () => {
    withAuth()
    db({ data: null, error: { code: 'PGRST116' } })
    expect((await request(app).delete(`/api/rooms/${uuid(1)}`)
      .set('Authorization', FAKE_TOKEN)
      .set('x-room-token', roomToken())).status).toBe(404)
  })

  it('403 usuario no es owner', async () => {
    withAuth()
    db({ data: { owner_id: uuid(50) }, error: null })
    expect((await request(app).delete(`/api/rooms/${uuid(1)}`)
      .set('Authorization', FAKE_TOKEN)
      .set('x-room-token', roomToken())).status).toBe(403)
  })

  it('200 elimina sala si usuario es owner', async () => {
    withAuth()
    db({ data: { owner_id: AUTH_USER.id }, error: null }, { error: null })
    const { status, body } = await request(app)
      .delete(`/api/rooms/${uuid(1)}`)
      .set('Authorization', FAKE_TOKEN)
      .set('x-room-token', roomToken())
    expect(status).toBe(200)
    expect(body.data.deleted).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/rooms/:id/join
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/rooms/:id/join', () => {
  it('401 sin token', async () => {
    expect((await request(app).post(`/api/rooms/${uuid(1)}/join`)).status).toBe(401)
  })

  it('404 sala no existe', async () => {
    withAuth()
    db({ data: null, error: { code: 'PGRST116' } })
    expect((await request(app).post(`/api/rooms/${uuid(1)}/join`)
      .set('Authorization', FAKE_TOKEN)).status).toBe(404)
  })

  it('403 sala privada usuario no es miembro', async () => {
    withAuth()
    const room = mockRoom({ is_public: false, owner_id: uuid(50) })
    db({ data: room, error: null }, { data: null, error: null })
    expect((await request(app).post(`/api/rooms/${room.id}/join`)
      .set('Authorization', FAKE_TOKEN)).status).toBe(403)
  })

  it('409 sala llena', async () => {
    withAuth()
    const room = mockRoom({ is_public: true, max_users: 2 })
    db({ data: room, error: null }, { count: 2, error: null })
    expect((await request(app).post(`/api/rooms/${room.id}/join`)
      .set('Authorization', FAKE_TOKEN)).status).toBe(409)
  })

  it('200 join exitoso', async () => {
    withAuth()
    const room = mockRoom({ is_public: true, max_users: 16 })
    db({ data: room, error: null }, { count: 5, error: null }, { error: null })
    const { status, body } = await request(app)
      .post(`/api/rooms/${room.id}/join`).set('Authorization', FAKE_TOKEN)
    expect(status).toBe(200)
    expect(body.data.joined).toBe(true)
    expect(typeof body.data.roomToken).toBe('string')
  })

  it('200 already_member en sala privada', async () => {
    withAuth()
    const room = mockRoom({ is_public: false, owner_id: uuid(50) })
    db({ data: room, error: null }, { data: { role: 'editor' }, error: null })
    const { status, body } = await request(app)
      .post(`/api/rooms/${room.id}/join`).set('Authorization', FAKE_TOKEN)
    expect(status).toBe(200)
    expect(body.data.already_member).toBe(true)
    expect(typeof body.data.roomToken).toBe('string')
  })
})