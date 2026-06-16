// URL base del backend — viene del .env
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Función genérica para hacer requests al backend
async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  roomToken?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  // Si hay token, lo agrega en el header Authorization
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (roomToken) {
    headers['x-room-token'] = roomToken
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  const data = await res.json()

  // Si el servidor respondió con ok: false, lanzamos error
  if (!data.ok) {
    throw new Error(data.error || 'Error desconocido')
  }

  return data.data
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    register: (email: string, password: string, name: string) =>
      request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      }),

    login: (email: string, password: string) =>
      request<{ session: { access_token: string }; user: { id: string; email: string } }>(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) }
      ),

    me: (token: string) =>
      request<{ id: string; email: string; name: string }>('/api/auth/me', {}, token),
  },

  rooms: {
    list: (token: string) =>
      request<Room[]>('/api/rooms', {}, token),

    create: (token: string, payload: CreateRoomPayload) =>
      request<Room>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, token),

    join: (token: string, roomId: string) =>
      request<JoinRoomResponse>(`/api/rooms/${roomId}/join`, { method: 'POST' }, token),

    remove: (token: string, roomId: string, roomToken?: string | null) =>
      request<{ deleted: boolean }>(`/api/rooms/${roomId}`, { method: 'DELETE' }, token, roomToken),
  },
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Room {
  id: string
  name: string
  description?: string
  max_users: number
  is_public: boolean
  owner_id: string
  created_at: string
}

export interface CreateRoomPayload {
  name: string
  description?: string
  max_users?: number
  is_public?: boolean
}

export interface JoinRoomResponse {
  joined: boolean
  already_member?: boolean
  room: Room
  roomToken?: string
}
