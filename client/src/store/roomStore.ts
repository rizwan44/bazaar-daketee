import type {
  RoomClosedPayload,
  RoomErrorPayload,
  RoomStartedPayload,
  RoomStatePayload,
} from '@card-games/shared';
import { create } from 'zustand';

interface RoomStoreState {
  room: RoomStatePayload | null;
  selfUserId: string | null;
  identified: boolean;
  error: RoomErrorPayload | null;
  startedSession: RoomStartedPayload | null;
  closedInfo: RoomClosedPayload | null;
  setIdentified: (userId: string) => void;
  setRoom: (room: RoomStatePayload) => void;
  setStartedSession: (payload: RoomStartedPayload) => void;
  setClosed: (payload: RoomClosedPayload) => void;
  setError: (error: RoomErrorPayload) => void;
  clearError: () => void;
  clearRoom: () => void;
}

/**
 * Lives outside any single screen so navigating Create Room -> Room Lobby
 * doesn't lose the state that arrived while the previous screen was mounted
 * — the socket listeners that feed this store are registered once, not
 * per-component (see roomSocket.ts).
 */
export const useRoomStore = create<RoomStoreState>((set) => ({
  room: null,
  selfUserId: null,
  identified: false,
  error: null,
  startedSession: null,
  closedInfo: null,
  setIdentified: (userId) => set({ selfUserId: userId, identified: true }),
  setRoom: (room) =>
    set((state) => ({
      room,
      closedInfo: null,
      // A waiting room can never legitimately carry a startedSession from
      // before — clears out anything left over from a room we previously
      // left. 'finished' is also kept: a rematch-capable game (see
      // RoomManager.closeRoomAfterGame) leaves the room in that status
      // while players are still looking at the table's own end screen —
      // clearing startedSession here would yank it away right as it
      // arrives, the same bug this whole 'finished' status exists to avoid.
      startedSession: room.status === 'in_progress' || room.status === 'finished' ? state.startedSession : null,
    })),
  setStartedSession: (startedSession) => set({ startedSession }),
  setClosed: (closedInfo) => set({ closedInfo, room: null, startedSession: null }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
  clearRoom: () => set({ room: null, startedSession: null, closedInfo: null }),
}));
