import { supabaseAdmin } from '../lib/supabase.js'

/**
 * trackEvent — registra un evento de sesión en session_events.
 *
 * Diseñado para ser fire-and-forget: NUNCA debe romper el flujo principal.
 * Cualquier error se loguea y se devuelve null en vez de lanzar.
 *
 * @param {string} roomId
 * @param {string|null} userId
 * @param {string} eventType  'join' | 'leave' | 'object_add' | 'object_delete' | 'file_upload' | 'snapshot'
 * @param {object} [payload={}]
 * @returns el evento creado, o null si falló
 */
export const trackEvent = async (roomId, userId, eventType, payload = {}) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('session_events')
      .insert({
        room_id: roomId,
        user_id: userId ?? null,
        event_type: eventType,
        payload: payload ?? {},
      })
      .select()
      .single()

    if (error) {
      console.error('[sessionEventService] No se pudo registrar el evento:', error)
      return null
    }

    return data
  } catch (err) {
    console.error('[sessionEventService] Error inesperado en trackEvent:', err)
    return null
  }
}

/**
 * getHistory — devuelve el historial de eventos de una sala.
 *
 * @param {string} roomId
 * @param {object} [options]
 * @param {number} [options.limit=50]
 * @param {string|null} [options.before=null] cursor: created_at; devuelve eventos anteriores
 * @param {string|null} [options.eventType=null] filtro por tipo de evento
 * @returns array de eventos ordenados por created_at DESC
 */
export const getHistory = async (roomId, options = {}) => {
  const { limit = 50, before = null, eventType = null } = options

  let query = supabaseAdmin
    .from('session_events')
    .select('*')
    .eq('room_id', roomId)

  if (before) query = query.lt('created_at', before)
  if (eventType) query = query.eq('event_type', eventType)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}
