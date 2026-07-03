import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../lib/supabase.js'
import { getHistory } from './sessionEventService.js'

// ─── Cliente de Claude ────────────────────────────────────────────────────────
// La API key vive SOLO en el backend (.env). El browser nunca la ve.
// Cliente perezoso: se crea en la primera llamada, cuando dotenv ya cargó el .env.
// (Crearlo al importar el módulo puede leer process.env antes de dotenv/config.)
let _anthropic = null
const getClient = () => {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

// claude-sonnet-4-6: buen balance calidad/costo para resúmenes.
// (claude-sonnet-4 fue retirado; se puede sobreescribir con SUMMARY_MODEL.)
const MODEL = process.env.SUMMARY_MODEL || 'claude-sonnet-4-6'

// Instrucciones de CÓMO resumir. No cambia entre salas.
const SYSTEM_PROMPT = `Eres un asistente que resume sesiones de trabajo colaborativo en un espacio XR (realidad mixta). Los participantes usan headsets y/o el cliente web, comparten un pizarrón, mueven objetos 3D, suben archivos y hablan por voz.

Genera un resumen claro y accionable en español con esta estructura:
1. Resumen general (2-3 frases).
2. Participantes y su actividad principal.
3. Cambios clave en la sala (objetos añadidos/eliminados, archivos, snapshots).
4. Próximos pasos sugeridos (si los hay).

Sé conciso y concreto. Básate SOLO en los eventos entregados; no inventes datos.`

// ─── Recopilar contexto ───────────────────────────────────────────────────────
/**
 * Junta los datos de la sala que alimentan el prompt: eventos (DGO-12),
 * datos de la sala y participantes.
 */
export const gatherRoomContext = async (roomId) => {
  // Reutiliza la capa de servicio de eventos (no toca la tabla directo).
  const events = await getHistory(roomId, { limit: 200 })

  const [roomRes, membersRes] = await Promise.all([
    supabaseAdmin.from('rooms').select('name, description').eq('id', roomId).single(),
    supabaseAdmin.from('room_members').select('user_id, role').eq('room_id', roomId),
  ])

  const room = roomRes.data || {}
  const members = membersRes.data || []

  // getHistory devuelve DESC (más nuevo primero); para el timeline lo queremos ASC.
  const timeline = [...events].reverse()

  const countBy = (type) => events.filter((e) => e.event_type === type).length
  const stats = {
    total_events: events.length,
    participants: members.length,
    joins: countBy('join'),
    objects_added: countBy('object_add'),
    objects_deleted: countBy('object_delete'),
    files_uploaded: countBy('file_upload'),
    snapshots: countBy('snapshot'),
  }

  return { room, members, timeline, stats }
}

// ─── Construir el prompt de usuario ───────────────────────────────────────────
const buildUserPrompt = ({ room, timeline, stats }) => {
  const lines = timeline.map((e) => {
    const t = new Date(e.created_at).toISOString().slice(11, 19)
    const detail =
      e.payload && Object.keys(e.payload).length ? ` ${JSON.stringify(e.payload)}` : ''
    return `[${t}] ${e.event_type} (user:${e.user_id ?? '—'})${detail}`
  })

  return `Sala: ${room.name ?? 'sin nombre'}
Descripción: ${room.description ?? '—'}

Métricas:
- Participantes: ${stats.participants}
- Eventos totales: ${stats.total_events}
- Objetos añadidos/eliminados: ${stats.objects_added}/${stats.objects_deleted}
- Archivos subidos: ${stats.files_uploaded}
- Snapshots: ${stats.snapshots}

Timeline de eventos (más antiguo primero):
${lines.join('\n') || '(sin eventos registrados)'}

Genera el resumen de la sesión siguiendo la estructura indicada.`
}

// ─── Streaming a Claude ───────────────────────────────────────────────────────
/**
 * Llama a Claude con streaming. Invoca onDelta(text) por cada fragmento
 * de texto que llega. Devuelve el resumen completo + las stats de contexto.
 */
export const streamSummary = async (roomId, onDelta) => {
  const context = await gatherRoomContext(roomId)
  const userPrompt = buildUserPrompt(context)

  let full = ''
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  stream.on('text', (delta) => {
    full += delta
    onDelta(delta)
  })

  await stream.finalMessage()
  return { summary: full, stats: context.stats }
}

// ─── Persistencia ─────────────────────────────────────────────────────────────
/**
 * Guarda el resumen generado en room_summaries.
 */
export const saveSummary = async ({ roomId, userId, summary, stats }) => {
  const { data, error } = await supabaseAdmin
    .from('room_summaries')
    .insert({
      room_id: roomId,
      generated_by: userId,
      summary,
      model: MODEL,
      context_stats: stats,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Devuelve el resumen más reciente de una sala (o null si no hay).
 */
export const getLatestSummary = async (roomId) => {
  const { data, error } = await supabaseAdmin
    .from('room_summaries')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}