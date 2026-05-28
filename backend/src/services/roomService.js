import { redis } from '../lib/redis.js'
import { supabase } from '../lib/supabase.js'

const SPATIAL_TTL = 300 // 5 minutos

export async function getSpatialState(roomId) {
  const cacheKey = `room:spatial:${roomId}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const { data, error } = await supabase
    .from('spatial_objects')
    .select('*')
    .eq('room_id', roomId)

  if (error) throw error
  await redis.setex(cacheKey, SPATIAL_TTL, JSON.stringify(data))
  return data
}

export async function invalidateSpatialCache(roomId) {
  await redis.del(`room:spatial:${roomId}`)
}
