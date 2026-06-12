import { supabaseAdmin } from '../lib/supabase.js'

/**
 * uploadFile — sube un archivo a Supabase Storage
 * y crea el spatial object correspondiente en la DB
 */
export const uploadFile = async (roomId, userId, file) => {
  // Verificar que el usuario es editor u owner
  const { data: member } = await supabaseAdmin
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single()

  if (!member || member.role === 'viewer') {
    const err = new Error('Sin permisos para subir archivos')
    err.status = 403
    throw err
  }

  // Generar path único para el archivo
  const ext = file.originalname.split('.').pop()
  const filename = `${roomId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  // Subir a Supabase Storage
  const { error: uploadError } = await supabaseAdmin
    .storage
    .from('room-files')
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    })

  if (uploadError) throw uploadError

  // Obtener URL pública
  const { data: { publicUrl } } = supabaseAdmin
    .storage
    .from('room-files')
    .getPublicUrl(filename)

  // Determinar tipo de spatial object
  const type = file.mimetype.startsWith('image/') ? 'file'
    : file.mimetype === 'application/pdf' ? 'file'
    : 'file'

  // Crear el spatial object en la DB
  const { data: spatialObject, error: dbError } = await supabaseAdmin
    .from('spatial_objects')
    .insert({
      room_id: roomId,
      type,
      content_url: publicUrl,
      metadata: {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      position: { x: 0, y: 1.5, z: -2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      created_by: userId,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (dbError) throw dbError

  return spatialObject
}