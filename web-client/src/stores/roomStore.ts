import { create } from 'zustand'
import { api, Room, CreateRoomPayload } from '../lib/api'

interface RoomStore {
  rooms: Room[]
  isLoading: boolean
  error: string | null

  // Acciones
  fetchRooms: (token: string) => Promise<void>
  createRoom: (token: string, payload: CreateRoomPayload) => Promise<Room>
  joinRoom: (token: string, roomId: string) => Promise<void>
  clearError: () => void
}

export const useRoomStore = create<RoomStore>((set) => ({
  rooms: [],
  isLoading: false,
  error: null,

  fetchRooms: async (token) => {
    set({ isLoading: true, error: null })
    try {
      const rooms = await api.rooms.list(token)
      set({ rooms, isLoading: false })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  createRoom: async (token, payload) => {
    set({ isLoading: true, error: null })
    try {
      const room = await api.rooms.create(token, payload)
      // Agrega la sala nueva al estado sin necesidad de refetch
      set((state) => ({ rooms: [room, ...state.rooms], isLoading: false }))
      return room
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
      throw err
    }
  },

  joinRoom: async (token, roomId) => {
    try {
      await api.rooms.join(token, roomId)
    } catch (err: any) {
      set({ error: err.message })
      throw err
    }
  },

  clearError: () => set({ error: null }),
}))
