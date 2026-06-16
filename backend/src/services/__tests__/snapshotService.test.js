/**
 * snapshotService.test.js — Tests para DGO-11 (snapshot del estado de sala)
 */

jest.mock('../../lib/supabase.js')

import { supabase, supabaseAdmin } from '../../lib/supabase.js'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import app from '../../index.js'
import { createSnapshot, listSnapshots } from '../snapshotService.js'

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

beforeEach(() => {
  jest.clearAllMocks()
  dbQueue.length = 0
  process.env.JWT_SECRET = TEST_JWT_SECRET
  process.env.LIVEBLOCKS_SECRET_KEY = 'sk_test_liveblocks'

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
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockImplementation(consumeNext),
    then: (resolve, reject) => consumeNext().then(resolve, reject),
  }

  supabaseAdmin.from.mockReturnValue(chain)

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { root: { foo: 'bar' } } }),
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// createSnapshot()
// ══════════════════════════════════════════════════════════════════════════════

describe('createSnapshot()', () => {
  it('inserta correctamente en room_snapshots', async () => {
    const objects = [{ id: uuid(2), room_id: ROOM_ID, type: 'cube' }]
    const snapshot = {
      id: uuid(3),
      room_id: ROOM_ID,
      triggered_by: 'manual',
      spatial_state: objects,
      liveblocks_state: { data: { root: { foo: 'bar' } } },
    }
    db({ data: objects, error: null }, { data: snapshot, error: null })

    const result = await createSnapshot(ROOM_ID, 'manual')

    expect(supabaseAdmin.from).toHaveBeenCalledWith('spatial_objects')
    expect(supabaseAdmin.from).toHaveBeenCalledWith('room_snapshots')
    expect(result).toEqual(snapshot)
    expect(result.liveblocks_state).not.toBeNull()
  })

  it('funciona aunque Liveblocks falle (liveblocks_state queda null)', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })

    const objects = [{ id: uuid(2), room_id: ROOM_ID, type: 'cube' }]
    const snapshot = {
      id: uuid(3),
      room_id: ROOM_ID,
      triggered_by: 'manual',
      spatial_state: objects,
      liveblocks_state: null,
    }
    db({ data: objects, error: null }, { data: snapshot, error: null })

    const result = await createSnapshot(ROOM_ID, 'manual')

    expect(result.liveblocks_state).toBeNull()
  })

  it('no lanza si fetch rechaza (error de red)', async () => {
    global.fetch.mockRejectedValue(new Error('network down'))

    const objects = []
    const snapshot = { id: uuid(3), room_id: ROOM_ID, liveblocks_state: null }
    db({ data: objects, error: null }, { data: snapshot, error: null })

    await expect(createSnapshot(ROOM_ID, 'cron')).resolves.toEqual(snapshot)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// listSnapshots()
// ══════════════════════════════════════════════════════════════════════════════

describe('listSnapshots()', () => {
  it('devuelve la lista de snapshots', async () => {
    const snapshots = [
      { id: uuid(3), created_at: '2026-01-02T00:00:00Z' },
      { id: uuid(4), created_at: '2026-01-01T00:00:00Z' },
    ]
    db({ data: snapshots, error: null })

    const result = await listSnapshots(ROOM_ID, 20)
    expect(result).toEqual(snapshots)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/rooms/:id/snapshots
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/rooms/:id/snapshots', () => {
  it('401 sin token', async () => {
    expect((await request(app).get(`/api/rooms/${ROOM_ID}/snapshots`)).status).toBe(401)
  })

  it('200 retorna lista ordenada por created_at DESC', async () => {
    withAuth()
    const snapshots = [
      { id: uuid(3), created_at: '2026-01-02T00:00:00Z' },
      { id: uuid(4), created_at: '2026-01-01T00:00:00Z' },
    ]
    db({ data: snapshots, error: null })

    const { status, body } = await request(app)
      .get(`/api/rooms/${ROOM_ID}/snapshots`)
      .set('Authorization', FAKE_TOKEN)

    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.snapshots).toEqual(snapshots)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/rooms/:id/snapshot
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/rooms/:id/snapshot', () => {
  it('401 sin token', async () => {
    expect((await request(app).post(`/api/rooms/${ROOM_ID}/snapshot`)).status).toBe(401)
  })

  it('403 con rol viewer', async () => {
    withAuth()
    const { status } = await request(app)
      .post(`/api/rooms/${ROOM_ID}/snapshot`)
      .set('Authorization', FAKE_TOKEN)
      .set('x-room-token', roomToken('viewer'))
    expect(status).toBe(403)
  })

  it('201 con rol editor retorna el snapshot', async () => {
    withAuth()
    const objects = [{ id: uuid(2), room_id: ROOM_ID, type: 'cube' }]
    const snapshot = {
      id: uuid(3),
      room_id: ROOM_ID,
      triggered_by: 'manual',
      spatial_state: objects,
      liveblocks_state: { data: {} },
    }
    db({ data: objects, error: null }, { data: snapshot, error: null })

    const { status, body } = await request(app)
      .post(`/api/rooms/${ROOM_ID}/snapshot`)
      .set('Authorization', FAKE_TOKEN)
      .set('x-room-token', roomToken('editor'))

    expect(status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.data.snapshot.id).toBe(snapshot.id)
  })
})
