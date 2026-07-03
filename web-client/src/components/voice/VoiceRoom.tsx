// src/components/voice/VoiceRoom.tsx
// DGO-14 — Voz en el browser con LiveKit.
//
// Se monta dentro de RoomDetail. Pide el token (hook), abre la conexión con
// <LiveKitRoom>, reproduce el audio remoto con <RoomAudioRenderer> y muestra
// un panel flotante con el control de micrófono y la lista de participantes.
//
// deps: npm i @livekit/components-react livekit-client

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useIsSpeaking,
} from '@livekit/components-react'
import type { Participant } from 'livekit-client'
import type { ReactNode } from 'react'
import { useVoiceToken } from '../../hooks/useVoiceToken'

export function VoiceRoom({ roomId }: { roomId: string }) {
  const { data, error, loading } = useVoiceToken(roomId)

  if (loading)
    return (
      <Panel>
        <p className="text-gray-500">Conectando voz…</p>
      </Panel>
    )

  if (error)
    return (
      <Panel>
        <p className="text-red-400">Voz no disponible</p>
        <p className="text-gray-600 text-[10px] mt-1">{error}</p>
      </Panel>
    )

  if (!data) return null

  return (
    <LiveKitRoom
      serverUrl={data.url}
      token={data.token}
      connect
      audio={data.can_publish} // viewers entran sin micrófono
      video={false}
    >
      {/* Invisible: reproduce el audio de los demás participantes */}
      <RoomAudioRenderer />

      <Panel>
        <p className="text-gray-500 mb-2">── voz ──</p>
        <VoiceControls canPublish={data.can_publish} />
        <ParticipantList />
      </Panel>
    </LiveKitRoom>
  )
}

// ─── Panel flotante (mismo lenguaje visual que el DebugPanel) ─────────────────
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="absolute bottom-4 left-4 z-20 min-w-[180px] max-w-xs rounded-lg border border-gray-700 bg-gray-900/90 p-3 font-mono text-xs text-gray-400">
      {children}
    </div>
  )
}

// ─── Control de micrófono ─────────────────────────────────────────────────────
function VoiceControls({ canPublish }: { canPublish: boolean }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()

  if (!canPublish) {
    return <p className="mb-2 text-gray-600">Modo espectador (solo escuchas)</p>
  }

  const toggle = () =>
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)

  return (
    <button
      onClick={toggle}
      className={`mb-2 flex w-full items-center justify-center gap-2 rounded px-2 py-1.5 transition ${
        isMicrophoneEnabled
          ? 'border border-green-800 bg-green-900/50 text-green-400'
          : 'border border-gray-700 bg-gray-800 text-gray-400'
      }`}
    >
      <MicIcon on={isMicrophoneEnabled} />
      {isMicrophoneEnabled ? 'Micrófono activo' : 'Silenciado'}
    </button>
  )
}

// ─── Lista de participantes ───────────────────────────────────────────────────
function ParticipantList() {
  const participants = useParticipants()

  if (participants.length === 0) {
    return <p className="text-gray-600">Nadie conectado aún</p>
  }

  return (
    <ul>
      {participants.map((p) => (
        <ParticipantRow key={p.identity} participant={p} />
      ))}
    </ul>
  )
}

function ParticipantRow({ participant }: { participant: Participant }) {
  const speaking = useIsSpeaking(participant)
  const muted = !participant.isMicrophoneEnabled

  return (
    <li className="flex items-center gap-2 py-0.5">
      <span
        className={`h-2 w-2 rounded-full transition ${
          speaking ? 'bg-green-400 ring-2 ring-green-400/30' : 'bg-gray-600'
        }`}
      />
      <span className="text-gray-300">
        {participant.name || participant.identity.slice(0, 8)}
      </span>
      {participant.isLocal && <span className="text-gray-600">(tú)</span>}
      {muted && !participant.isLocal && <MicIcon on={false} small />}
    </li>
  )
}

// ─── Ícono de micrófono inline (sin dependencias extra) ───────────────────────
function MicIcon({ on, small }: { on: boolean; small?: boolean }) {
  const s = small ? 10 : 12
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      {!on && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}