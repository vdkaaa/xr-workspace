import { create } from 'zustand'
import { api } from '../lib/api'

// Tipo del usuario autenticado
interface User {
  id: string
  email: string
  name: string
}

// Forma del store de auth
interface AuthStore {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null

  // Acciones
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  clearError: () => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  // Estado inicial — leemos el token del localStorage si existe
  user: null,
  token: localStorage.getItem('xr_token'),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const data = await api.auth.login(email, password)
      const token = data.session.access_token

      // Guardamos el token en localStorage para persistir la sesión
      localStorage.setItem('xr_token', token)

      // Pedimos los datos del usuario con el token nuevo
      const user = await api.auth.me(token)

      set({ token, user, isLoading: false })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  register: async (email, password, name) => {
    set({ isLoading: true, error: null })
    try {
      await api.auth.register(email, password, name)
      // Después de registrar, hacemos login automático
      await get().login(email, password)
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  logout: () => {
    localStorage.removeItem('xr_token')
    set({ user: null, token: null })
  },

  clearError: () => set({ error: null }),
}))
