import { useRoomStore } from "../stores/roomStore";

export const getRoomHeaders = (): Record<string, string> => {
  const roomToken = useRoomStore.getState().roomToken;
  return roomToken ? { "x-room-token": roomToken } : {};
};
