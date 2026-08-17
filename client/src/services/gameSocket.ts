import { SOCKET_EVENTS } from '@card-games/shared';
import { isLocalSessionActive, sendLocalMove } from '../local/LocalGameSession';
import type { AnyGameEndedPayload, AnyGameView } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { getSocket } from './socket';

let listenersRegistered = false;

/** Registers the game-state listeners exactly once, same pattern as `roomSocket.ts`. Payload shape depends on whichever game the active session is for. */
export function ensureGameSocketReady(): void {
  // A fully offline local game never touches a socket at all — its own
  // `pushView()` already writes straight into `gameStore` (see
  // LocalGameSession.ts). Registering listeners here would just be dead
  // weight, and — more importantly — connecting the socket at all would
  // violate the whole point of "offline."
  if (isLocalSessionActive()) return;
  if (listenersRegistered) return;
  listenersRegistered = true;

  const socket = getSocket();
  socket.on(SOCKET_EVENTS.GAME_STATE, (view: AnyGameView) => {
    useGameStore.getState().setView(view);
  });
  socket.on(SOCKET_EVENTS.GAME_ENDED, (payload: AnyGameEndedPayload) => {
    useGameStore.getState().setEnded(payload);
  });
}

export function joinGame(gameSessionId: string): void {
  // The local session already has its initial view sitting in the store the
  // moment it starts — there's no server to "join".
  if (isLocalSessionActive()) return;
  getSocket().emit(SOCKET_EVENTS.GAME_JOIN, { gameSessionId });
}

export function sendMove(
  gameSessionId: string,
  moveType: string,
  extra?: { cardId?: string; payload?: Record<string, unknown> },
): void {
  if (isLocalSessionActive()) {
    sendLocalMove(moveType, extra);
    return;
  }
  getSocket().emit(SOCKET_EVENTS.GAME_MOVE, { gameSessionId, moveType, ...extra });
}
