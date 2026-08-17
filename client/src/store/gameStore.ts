import type { FourCardEndedPayload, FourCardPlayerView, GameEndedPayload, TeenPattiPlayerView } from '@card-games/shared';
import { create } from 'zustand';

export type AnyGameView = TeenPattiPlayerView | FourCardPlayerView;
export type AnyGameEndedPayload = GameEndedPayload | FourCardEndedPayload;

interface GameStoreState {
  view: AnyGameView | null;
  ended: AnyGameEndedPayload | null;
  setView: (view: AnyGameView) => void;
  setEnded: (ended: AnyGameEndedPayload) => void;
  clear: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  view: null,
  ended: null,
  setView: (view) => set({ view }),
  setEnded: (ended) => set({ ended }),
  clear: () => set({ view: null, ended: null }),
}));
