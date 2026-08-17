import { SOCKET_EVENTS, type GameJoinRequest, type GameMoveRequest } from '@card-games/shared';
import type { GameSessionManager } from '../game/GameSessionManager.js';
import { AppError } from '../utils/errors.js';
import type { AppSocket } from './types.js';

function emitError(socket: AppSocket, error: unknown, fallbackMessage: string): void {
  if (error instanceof AppError) {
    socket.emit(SOCKET_EVENTS.ERROR, { code: error.code, message: error.message });
    return;
  }
  socket.emit(SOCKET_EVENTS.ERROR, { code: 'INTERNAL_ERROR', message: fallbackMessage });
}

function requireIdentity(socket: AppSocket): { userId: string } {
  if (!socket.data.userId) {
    throw new AppError('NOT_IDENTIFIED', 'You must identify before doing that.');
  }
  return { userId: socket.data.userId };
}

export function registerGameHandlers(socket: AppSocket, gameSessionManager: GameSessionManager): void {
  socket.on(SOCKET_EVENTS.GAME_JOIN, (payload: GameJoinRequest) => {
    try {
      const { userId } = requireIdentity(socket);
      gameSessionManager.handleJoin(payload.gameSessionId, userId, socket.id);
    } catch (error) {
      emitError(socket, error, 'Could not join the game.');
    }
  });

  socket.on(SOCKET_EVENTS.GAME_MOVE, (payload: GameMoveRequest) => {
    try {
      const { userId } = requireIdentity(socket);
      gameSessionManager.handleMove(payload.gameSessionId, userId, {
        type: payload.moveType,
        cardId: payload.cardId,
        payload: payload.payload,
      });
    } catch (error) {
      emitError(socket, error, 'Could not make that move.');
    }
  });

  socket.on('disconnect', () => {
    gameSessionManager.handleSocketDisconnect(socket.id);
  });
}
