import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useRoomStore } from '../stores/roomStore'
import { Button, Card, Input } from '../components/ui'
import { Room } from '../lib/api'

export const RoomsPage: React.FC = () => {
  const { user, token, logout } = useAuthStore()
  const { rooms, isLoading, fetchRooms, createRoom } = useRoomStore()

  // Modal de crear sala
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (token) fetchRooms(token)
  }, [token])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !newName.trim()) return
    setCreating(true)
    try {
      await createRoom(token, { name: newName, description: newDesc, is_public: isPublic })
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>

      {/* Header */}
      <header className="border-b border-[var(--bg-border)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-semibold text-[var(--text-primary)] text-sm">XR Rooms Meet</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-secondary)]">
              {user?.name || user?.email}
            </span>
            <Button variant="ghost" onClick={logout} className="text-xs px-3 py-2">
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* Título + botón crear */}
        <div className="flex items-center justify-between mb-8 fade-up">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Mis salas</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {rooms.length} sala{rooms.length !== 1 ? 's' : ''} disponible{rooms.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            + Nueva sala
          </Button>
        </div>

        {/* Lista de salas */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20 fade-up">
            <p className="text-[var(--text-secondary)] text-sm">No tenés salas todavía</p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              Crear primera sala
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room, i) => (
              <RoomCard key={room.id} room={room} delay={i} token={token!} />
            ))}
          </div>
        )}
      </main>

      {/* Modal crear sala */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4 z-50">
          <Card className="w-full max-w-md p-6 fade-up">
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-5">
              Nueva sala
            </h3>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <Input
                label="Nombre"
                placeholder="Ej: Sala de diseño sprint 2"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
              />
              <Input
                label="Descripción (opcional)"
                placeholder="De qué trata esta sala"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              />
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setIsPublic(p => !p)}
                  className={`w-10 h-6 rounded-full transition-colors duration-200 relative ${
                    isPublic ? 'bg-blue-500' : 'bg-[var(--bg-elevated)]'
                  } border border-white/10`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                    isPublic ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-sm text-[var(--text-secondary)]">Sala pública</span>
              </label>
              <div className="flex gap-3 mt-2">
                <Button variant="ghost" className="flex-1" onClick={() => setShowCreate(false)} type="button">
                  Cancelar
                </Button>
                <Button className="flex-1" type="submit" isLoading={creating}>
                  Crear sala
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─── Room Card ────────────────────────────────────────────────────────────────

const RoomCard: React.FC<{ room: Room; delay: number; token: string }> = ({ room, delay }) => {
  const { joinRoom } = useRoomStore()
  const { token } = useAuthStore()
  const [joining, setJoining] = useState(false)

  const handleJoin = async () => {
    if (!token) return
    setJoining(true)
    try {
      await joinRoom(token, room.id)
      // Acá después navegaremos a la sala XR
      alert(`Unido a "${room.name}" — próximamente abrirá la sala 3D`)
    } finally {
      setJoining(false)
    }
  }

  return (
    <Card className={`p-5 hover:border-blue-500/20 transition-all duration-200 cursor-default fade-up fade-up-delay-${Math.min(delay + 1, 4)}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="#3b82f6" strokeWidth="1.5"/>
            <path d="M8 12h8M12 8v8" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          room.is_public
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-white/5 text-[var(--text-muted)] border border-white/8'
        }`}>
          {room.is_public ? 'Pública' : 'Privada'}
        </span>
      </div>

      <h3 className="font-medium text-[var(--text-primary)] text-sm mb-1 truncate">
        {room.name}
      </h3>
      {room.description && (
        <p className="text-xs text-[var(--text-secondary)] mb-3 line-clamp-2">
          {room.description}
        </p>
      )}

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-[var(--text-muted)]">
          Max {room.max_users} usuarios
        </span>
        <Button variant="ghost" className="text-xs px-3 py-1.5" onClick={handleJoin} isLoading={joining}>
          Entrar
        </Button>
      </div>
    </Card>
  )
}
