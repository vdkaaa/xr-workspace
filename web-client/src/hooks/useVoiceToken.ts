// src/hooks/useVoiceToken.ts
// DGO-14 — Pide el token de voz al backend (DGO-13) usando el token de sesión
// que ya vive en useAuthStore. Devuelve { data, error, loading }.

import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

interface VoiceToken {
  token: string
  url: string
  room_id: string
  identity: string
  can_publish: boolean
}

export function useVoiceToken(roomId: string) {
  const authToken = useAuthStore((s) => s.token)
  const [data, setData] = useState<VoiceToken | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authToken) return
    let cancelled = false
    setLoading(true)
    setError(null)

    api.livekit
      .token(authToken, roomId)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [roomId, authToken])

  return { data, error, loading }
}