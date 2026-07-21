// src/components/room/SummaryPanel.tsx
// DGO-15 (web) — Botón "Resumir sesión con IA" que dispara el resumen en el
// backend y muestra el texto en streaming (SSE) a medida que Claude lo genera.
//
// Usa fetch + ReadableStream (no EventSource) porque necesitamos enviar los
// headers Authorization y x-room-token, que EventSource no permite.

import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useRoomStore } from '../../stores/roomStore'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function SummaryPanel({ roomId }: { roomId: string }) {
  const token = useAuthStore((s) => s.token)
  const roomToken = useRoomStore((s) => s.roomToken)
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setText('')
    setError(null)
    setRunning(true)

    try {
      const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/summarize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-room-token': roomToken ?? '', // rol en la sala (owner/editor)
        },
      })

      if (!res.ok || !res.body) {
        throw new Error('Could not start the summary')
      }

      // Leemos el stream SSE manualmente.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Cada bloque SSE termina en doble salto de línea.
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
          const eventLine = block.match(/^event: (.+)$/m)?.[1]
          const dataLine = block.match(/^data: (.+)$/m)?.[1]
          if (!dataLine) continue
          const payload = JSON.parse(dataLine)

          if (eventLine === 'delta') setText((t) => t + payload.text)
          else if (eventLine === 'error') setError(payload.message)
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="absolute top-4 left-4 z-20 w-80 max-w-[80vw] rounded-lg border border-gray-700 bg-gray-900/90 p-3 font-mono text-xs text-gray-300">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-gray-500">── AI summary ──</span>
        <button
          onClick={generate}
          disabled={running}
          className="rounded bg-violet-600 px-2 py-1 text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          {running ? 'Generating…' : 'Summarize session'}
        </button>
      </div>

      {error && <p className="text-red-400">{error}</p>}

      {text ? (
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed text-gray-200">
          {text}
        </div>
      ) : (
        !running && !error && (
          <p className="text-gray-600">
            Generate a summary of this room's activity with Claude.
          </p>
        )
      )}
    </div>
  )
}