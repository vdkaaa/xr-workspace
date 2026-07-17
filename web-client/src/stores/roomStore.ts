import { create } from 'zustand'
import { api, Room, CreateRoomPayload } from '../lib/api'

// Shared in-flight join so RoomsPage.handleJoin (pre-navigate) and
// RoomDetail's mount effect can both await the same POST /join without
// duplicating it when they overlap for the same roomId.
let joinInFlight: {
  roomId: string
  promise: Promise<void>
} | null = null

interface RoomStore {
  rooms: Room[]
  roomToken: string | null
  joinedRoomId: string | null
  joiningRoomId: string | null
  isLoading: boolean
  error: string | null

  // Acciones
  fetchRooms: (token: string) => Promise<void>
  createRoom: (token: string, payload: CreateRoomPayload) => Promise<Room>
  joinRoom: (token: string, roomId: string) => Promise<void>
  clearRoomToken: () => void
  clearError: () => void
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  rooms: [],
  roomToken: null,
  joinedRoomId: null,
  joiningRoomId: null,
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
    const state = get()

    // Already joined this room in this session — skip a second POST.
    if (
      state.joinedRoomId === roomId &&
      state.roomToken &&
      joinInFlight?.roomId !== roomId
    ) {
      return
    }

    // Same room already joining — await the shared in-flight request.
    if (joinInFlight?.roomId === roomId) {
      return joinInFlight.promise
    }

    const promise = (async () => {
      set({ joiningRoomId: roomId })
      try {
        const result = await api.rooms.join(token, roomId)
        set({
          roomToken: result.roomToken ?? null,
          joinedRoomId: roomId,
          joiningRoomId: null,
        })
        console.log(
          `[roomStore][DIAG] roomToken actualizado: ${result.roomToken?.slice(0, 12)}...`
        )
      } catch (err: any) {
        set({ error: err.message, joiningRoomId: null })
        throw err
      } finally {
        if (joinInFlight?.roomId === roomId) {
          joinInFlight = null
        }
      }
    })()

    joinInFlight = { roomId, promise }
    return promise
  },

  clearRoomToken: () =>
    set({ roomToken: null, joinedRoomId: null, joiningRoomId: null }),
  clearError: () => set({ error: null }),
}))
