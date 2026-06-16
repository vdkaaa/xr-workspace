/**
 * sessionEventService.test.js — Tests para DGO-12 (historial de sesiones / timeline)
 */

jest.mock('../../lib/supabase.js')

import { supabase, supabaseAdmin } from '../../lib/supabase.js'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import app from '../../index.js'
import { trackEvent, getHistory } from '../sessionEventService.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uuid = (n = 1) => `00000000-0000-0000-0000-00000000000${n}`
const AUTH_USER = { id: uuid(99), email: 'diego@test.com' }
const FAKE_TOKEN = 'Bearer fake-jwt-token'
const TEST_JWT_SECRET = 'test-jwt-secret'
const ROOM_ID = uuid(1)

const roomToken = (role = 'editor', roomId = ROOM_ID) =>
  jwt.sign({ sub: AUTH_USER.id, room_id: roomId, role }, TEST_JWT_SECRET)

const dbQueue = []
const db = (...results) => dbQueue.push(...results)

const consumeNext = () => {
  const next = dbQueue.shift()
  return Promise.resolve(next ?? { data: null, error: null })
}

const withAuth = () => {
  supabase.auth.getUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null })
}

let chain

beforeEach(() => {
  jest.clearAllMocks()
  dbQueue.length = 0
  process.env.JWT_SECRET = TEST_JWT_SECRET

  supabase.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'no auth' },
  })

  chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockImplementation(consumeNext),
    then: (resolve, reject) => consumeNext().then(resolve, reject),
  }

  supabaseAdmin.from.mockReturnValue(chain)
})

// ══════════════════════════════════════════════════════════════════════════════
// trackEvent()
// ══════════════════════════════════════════════════════════════════════════════

describe('trackEvent()', () => {
  it('inserta correctamente en session_events', async () => {
    const event = {
      id: uuid(2),
      room_id: ROOM_ID,
      user_id: AUTH_USER.id,
      event_type: 'join',
      payload: { role: 'editor' },
    }
    db({ data: event, error: null })

    const result = await trackEvent(ROOM_ID, AUTH_USER.id, 'join', { role: 'editor' })

    expect(supabaseAdmin.from).toHaveBeenCalledWith('session_events')
    expect(result).toEqual(event)
  })

  it('no lanza excepción si supabase falla (retorna null)', async () => {
    db({ data: null, error: { message: 'db down' } })

    const result = await trackEvent(ROOM_ID, AUTH_USER.id, 'join', {})
    expect(result).toBeNull()
  })

  it('no lanza si la query rechaza (retorna null)', async () => {
    chain.single.mockRejectedValueOnce(new Error('connection lost'))

    const result = await trackEvent(ROOM_ID, AUTH_USER.id, 'snapshot', {})
    expect(result).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// getHistory()
// ══════════════════════════════════════════════════════════════════════════════

describe('getHistory()', () => {
  it('retorna eventos ordenados DESC', async () => {
    const events = [
      { id: uuid(2), created_at: '2026-01-02T00:00:00Z', event_type: 'join' },
      { id: uuid(3), created_at: '2026-01-01T00:00:00Z', event_type: 'leave' },
    ]
    db({ data: events, error: null })

    const result = await getHistory(ROOM_ID)
    expect(result).toEqual(events)
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('filtra por eventType correctamente', async () => {
    db({ data: [], error: null })

    await getHistory(ROOM_ID, { eventType: 'file_upload' })
    expect(chain.eq).toHaveBeenCalledWith('event_type', 'file_upload')
  })

  it('pagina con cursor before', async () => {
    db({ data: [], error: null })

    await getHistory(ROOM_ID, { before: '2026-01-02T00:00:00Z' })
    expect(chain.lt).toHaveBeenCalledWith('created_at', '2026-01-02T00:00:00Z')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/rooms/:id/history
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/rooms/:id/history', () => {
  it('401 sin token', async () => {
    expect((await request(app).get(`/api/rooms/${ROOM_ID}/history`)).status).toBe(401)
  })

  it('200 con array de eventos', async () => {
    withAuth()
    const events = [
      { id: uuid(2), created_at: '2026-01-02T00:00:00Z', event_type: 'join' },
    ]
    db({ data: events, error: null })

    const { status, body } = await request(app)
      .get(`/api/rooms/${ROOM_ID}/history`)
      .set('Authorization', FAKE_TOKEN)

    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.events).toEqual(events)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/rooms/:id/leave
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/rooms/:id/leave', () => {
  it('401 sin token', async () => {
    expect((await request(app).post(`/api/rooms/${ROOM_ID}/leave`)).status).toBe(401)
  })

  it('200 con { left: true } y evento leave trackeado', async () => {
    withAuth()
    const event = { id: uuid(2), event_type: 'leave', user_id: AUTH_USER.id }
    db({ data: event, error: null })

    const { status, body } = await request(app)
      .post(`/api/rooms/${ROOM_ID}/leave`)
      .set('Authorization', FAKE_TOKEN)
      .set('x-room-token', roomToken('viewer'))

    expect(status).toBe(200)
    expect(body.data.left).toBe(true)
    expect(supabaseAdmin.from).toHaveBeenCalledWith('session_events')
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'leave', room_id: ROOM_ID })
    )
  })
})
