import { supabaseAdmin } from '../lib/supabase.js'

const LIVEBLOCKS_API = 'https://api.liveblocks.io/v2'

/**
 * fetchLiveblocksState — obtiene el estado de storage de Liveblocks vía REST.
 * Si falla (sala sin estado, error de red, etc.) loguea y devuelve null sin lanzar.
 */
const fetchLiveblocksState = async (roomId) => {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY
  if (!secret) {
    console.error('[snapshotService] LIVEBLOCKS_SECRET_KEY no definida')
    return null
  }

  try {
    const res = await fetch(`${LIVEBLOCKS_API}/rooms/${roomId}/storage`, {
      headers: { Authorization: `Bearer ${secret}` },
    })

    if (!res.ok) {
      console.error(
        `[snapshotService] Liveblocks REST devolvió ${res.status} para la sala ${roomId}`
      )
      return null
    }

    return await res.json()
  } catch (err) {
    console.error('[snapshotService] Error consultando Liveblocks:', err)
    return null
  }
}

/**
 * createSnapshot — captura el estado actual de una sala (spatial_objects +
 * estado de Liveblocks) y lo persiste en room_snapshots.
 *
 * @param {string} roomId
 * @param {'manual'|'cron'} [triggeredBy='manual']
 * @returns el snapshot creado
 */
export const createSnapshot = async (roomId, triggeredBy = 'manual') => {
  // 1. Objetos espaciales actuales
  const { data: objects, error: objectsError } = await supabaseAdmin
    .from('spatial_objects')
    .select('*')
    .eq('room_id', roomId)

  if (objectsError) throw objectsError

  // 2. Estado de Liveblocks (no lanza si falla)
  const lbState = await fetchLiveblocksState(roomId)

  // 3. Insertar el snapshot
  const { data: snapshot, error: insertError } = await supabaseAdmin
    .from('room_snapshots')
    .insert({
      room_id: roomId,
      triggered_by: triggeredBy,
      spatial_state: objects,
      liveblocks_state: lbState,
    })
    .select()
    .single()

  if (insertError) throw insertError

  return snapshot
}

/**
 * snapshotActiveRooms — itera las salas activas (modificadas en el último
 * intervalo) y crea un snapshot 'cron' para cada una. Pensado para ser llamado
 * desde un cron externo (Railway) vía el endpoint interno.
 *
 * @param {number} [sinceMinutes=31] ventana de actividad en minutos
 */
export const snapshotActiveRooms = async (sinceMinutes = 31) => {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString()

  const { data: rooms, error } = await supabaseAdmin
    .from('rooms')
    .select('id')
    .gt('updated_at', since)

  if (error) throw error

  const results = []
  for (const room of rooms ?? []) {
    try {
      const snapshot = await createSnapshot(room.id, 'cron')
      results.push({ room_id: room.id, ok: true, snapshot_id: snapshot.id })
    } catch (err) {
      console.error(`[snapshotService] Falló snapshot de la sala ${room.id}:`, err)
      results.push({ room_id: room.id, ok: false, error: err.message })
    }
  }

  return results
}

/**
 * listSnapshots — devuelve los snapshots más recientes de una sala.
 */
export const listSnapshots = async (roomId, limit = 20) => {
  const { data, error } = await supabaseAdmin
    .from('room_snapshots')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}
