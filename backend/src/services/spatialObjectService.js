import { supabaseAdmin } from '../lib/supabase.js'

// ─── Service methods ──────────────────────────────────────────────────────────

/**
 * listSpatialObjects — devuelve todos los objetos de una sala
 */
export const listSpatialObjects = async (roomId, userId) => {
  // Verificar que el usuario es miembro de la sala
  const { data: member } = await supabaseAdmin
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('Sin acceso a esta sala')
    err.status = 403
    throw err
  }

  const { data, error } = await supabaseAdmin
    .from('spatial_objects')
    .select('*')
    .eq('room_id', roomId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data
}

/**
 * createSpatialObject — crea un objeto espacial en una sala
 */
export const createSpatialObject = async (roomId, userId, payload) => {
  // Verificar que el usuario es editor u owner
  const { data: member } = await supabaseAdmin
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single()

  if (!member || member.role === 'viewer') {
    const err = new Error('Sin permisos para crear objetos')
    err.status = 403
    throw err
  }

  const { data, error } = await supabaseAdmin
    .from('spatial_objects')
    .insert({
      room_id: roomId,
      type: payload.type,
      position: payload.position ?? { x: 0, y: 0, z: 0 },
      rotation: payload.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
      scale: payload.scale ?? { x: 1, y: 1, z: 1 },
      content_url: payload.content_url ?? null,
      metadata: payload.metadata ?? {},
      created_by: userId,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * updateSpatialObject — actualiza posición/rotación/escala de un objeto
 */
export const updateSpatialObject = async (objectId, userId, payload) => {
  // Verificar que el objeto existe
  const { data: obj, error: fetchError } = await supabaseAdmin
    .from('spatial_objects')
    .select('id, room_id, created_by')
    .eq('id', objectId)
    .single()

  if (fetchError || !obj) {
    const err = new Error('Objeto no encontrado')
    err.status = 404
    throw err
  }

  // Verificar permisos — creador o owner de la sala
  const { data: member } = await supabaseAdmin
    .from('room_members')
    .select('role')
    .eq('room_id', obj.room_id)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('Sin acceso a esta sala')
    err.status = 403
    throw err
  }

  if (obj.created_by !== userId && member.role !== 'owner') {
    const err = new Error('Sin permisos para mover este objeto')
    err.status = 403
    throw err
  }

  const updates = { updated_at: new Date().toISOString() }
  if (payload.position) updates.position = payload.position
  if (payload.rotation) updates.rotation = payload.rotation
  if (payload.scale) updates.scale = payload.scale
  if (payload.metadata) updates.metadata = payload.metadata
  if (payload.content_url) updates.content_url = payload.content_url

  const { data, error } = await supabaseAdmin
    .from('spatial_objects')
    .update(updates)
    .eq('id', objectId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * deleteSpatialObject — elimina un objeto (creador o owner)
 */
export const deleteSpatialObject = async (objectId, userId) => {
  const { data: obj, error: fetchError } = await supabaseAdmin
    .from('spatial_objects')
    .select('id, room_id, created_by')
    .eq('id', objectId)
    .single()

  if (fetchError || !obj) {
    const err = new Error('Objeto no encontrado')
    err.status = 404
    throw err
  }

  const { data: member } = await supabaseAdmin
    .from('room_members')
    .select('role')
    .eq('room_id', obj.room_id)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('Sin acceso a esta sala')
    err.status = 403
    throw err
  }

  if (obj.created_by !== userId && member.role !== 'owner') {
    const err = new Error('Sin permisos para eliminar este objeto')
    err.status = 403
    throw err
  }

  const { error } = await supabaseAdmin
    .from('spatial_objects')
    .delete()
    .eq('id', objectId)

  if (error) throw error
  return { deleted: true }
}