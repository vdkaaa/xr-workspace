import { create } from 'zustand'

export const useRoomStore = create((set) => ({
  currentRoom: null,
  spatialObjects: [],
  participants: [],
  setRoom: (room) => set({ currentRoom: room }),
  setSpatialObjects: (objects) => set({ spatialObjects: objects }),
  addParticipant: (user) => set((s) => ({
    participants: [...s.participants.filter(p => p.id !== user.id), user]
  })),
  removeParticipant: (userId) => set((s) => ({
    participants: s.participants.filter(p => p.id !== userId)
  })),
}))
