import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../lib/supabase.js'
import { trackEvent } from './sessionEventService.js'

const MAX_USERS_HARD_LIMIT = 16

// ─── Helpers ─────────────────────────────────────────────────────────────────

const roomQuery = () =>
  supabaseAdmin
    .from('rooms')
    .select(`
      id,
      name,
      description,
      max_users,
      is_public,
      spatial_state,
      created_at,
      updated_at,
      owner_id
    `)

// ─── Service methods ──────────────────────────────────────────────────────────

/**
 * listRooms — devuelve las salas donde el usuario es owner o miembro
 */
export const listRooms = async (userId) => {
  // Salas propias
  const { data: ownedRooms, error: e1 } = await roomQuery()
    .eq('owner_id', userId)

  if (e1) throw e1

  // Salas donde es miembro
  const { data: memberships, error: e2 } = await supabaseAdmin
    .from('room_members')
    .select('room_id')
    .eq('user_id', userId)

  if (e2) throw e2

  const memberRoomIds = memberships.map(m => m.room_id)
  let memberRooms = []

  if (memberRoomIds.length > 0) {
    const { data, error: e3 } = await roomQuery().in('id', memberRoomIds)
    if (e3) throw e3
    memberRooms = data
  }

  // Merge y deduplicar por id
  const all = [...ownedRooms, ...memberRooms]
  const unique = Array.from(new Map(all.map(r => [r.id, r])).values())

  return unique
}

/**
 * getRoom — devuelve una sala si el usuario tiene acceso
 */
export const getRoom = async (roomId, userId) => {
  const { data: room, error } = await roomQuery().eq('id', roomId).single()

  if (error || !room) {
    const err = new Error('Sala no encontrada')
    err.status = 404
    throw err
  }

  // Verificar acceso: owner, miembro, o sala pública
  if (!room.is_public && room.owner_id !== userId) {
    const { data: member } = await supabaseAdmin
      .from('room_members')
      .select('room_id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single()

    if (!member) {
      const err = new Error('Sin acceso a esta sala')
      err.status = 403
      throw err
    }
  }

  return room
}

/**
 * createRoom — crea una sala nueva y añade al creator como owner en room_members
 */
export const createRoom = async (userId, payload) => {
  const maxUsers = Math.min(payload.max_users ?? MAX_USERS_HARD_LIMIT, MAX_USERS_HARD_LIMIT)

  const { data: room, error } = await supabaseAdmin
    .from('rooms')
    .insert({
      name: payload.name,
      description: payload.description || null,
      max_users: maxUsers,
      is_public: payload.is_public ?? false,
      owner_id: userId,
      spatial_state: {},
    })
    .select()
    .single()

  if (error) throw error

  // Añadir al creador como miembro con rol 'owner'
  const { error: memberError } = await supabaseAdmin
    .from('room_members')
    .insert({ room_id: room.id, user_id: userId, role: 'owner' })

  if (memberError) throw memberError

  return room
}

/**
 * updateRoom — actualiza una sala (solo el owner puede hacerlo)
 */
export const updateRoom = async (roomId, userId, payload) => {
  // Verificar que el usuario es el owner
  const { data: room, error: fetchError } = await supabaseAdmin
    .from('rooms')
    .select('owner_id')
    .eq('id', roomId)
    .single()

  if (fetchError || !room) {
    const err = new Error('Sala no encontrada')
    err.status = 404
    throw err
  }

  if (room.owner_id !== userId) {
    const err = new Error('Solo el owner puede editar la sala')
    err.status = 403
    throw err
  }

  // Si se intenta subir el max_users por encima del límite, recortarlo
  if (payload.max_users) {
    payload.max_users = Math.min(payload.max_users, MAX_USERS_HARD_LIMIT)
  }

  const { data: updated, error } = await supabaseAdmin
    .from('rooms')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .select()
    .single()

  if (error) throw error
  return updated
}

/**
 * deleteRoom — elimina la sala (solo el owner)
 */
export const deleteRoom = async (roomId, userId) => {
  const { data: room, error: fetchError } = await supabaseAdmin
    .from('rooms')
    .select('owner_id')
    .eq('id', roomId)
    .single()

  if (fetchError || !room) {
    const err = new Error('Sala no encontrada')
    err.status = 404
    throw err
  }

  if (room.owner_id !== userId) {
    const err = new Error('Solo el owner puede eliminar la sala')
    err.status = 403
    throw err
  }

  const { error } = await supabaseAdmin.from('rooms').delete().eq('id', roomId)
  if (error) throw error

  return { deleted: true }
}

/**
 * joinRoom — une al usuario a una sala con validación de capacidad (max 16)
 */
export const joinRoom = async (roomId, userId) => {
  // Obtener la sala
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id, max_users, is_public, owner_id')
    .eq('id', roomId)
    .single()

  if (roomError || !room) {
    const err = new Error('Sala no encontrada')
    err.status = 404
    throw err
  }

  // Si la sala es privada, verificar que el usuario ya fue invitado (existe en room_members)
  // En este caso simplemente bloqueamos el acceso a no-miembros no invitados
  if (!room.is_public) {
    const { data: existingMember } = await supabaseAdmin
      .from('room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single()

    if (!existingMember) {
      const err = new Error('Esta sala es privada')
      err.status = 403
      throw err
    }

    const roomToken = jwt.sign(
      { sub: userId, room_id: roomId, role: existingMember.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )

    await trackEvent(roomId, userId, 'join', { role: existingMember.role })

    // Ya es miembro, devolver info
    return { joined: true, already_member: true, room, roomToken }
  }

  // Contar miembros actuales
  const { count, error: countError } = await supabaseAdmin
    .from('room_members')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)

  if (countError) throw countError

  if (count >= room.max_users) {
    const err = new Error(`La sala está llena (máximo ${room.max_users} usuarios)`)
    err.status = 409
    throw err
  }

  // Upsert: si ya existe el member no falla, si no existe lo crea
  const { error: joinError } = await supabaseAdmin
    .from('room_members')
    .upsert(
      { room_id: roomId, user_id: userId, role: 'editor', last_seen_at: new Date().toISOString() },
      { onConflict: 'room_id,user_id' }
    )

  if (joinError) throw joinError

  const role = 'editor'
  const roomToken = jwt.sign(
    { sub: userId, room_id: roomId, role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  )

  await trackEvent(roomId, userId, 'join', { role })

  return { joined: true, room, roomToken }
}
