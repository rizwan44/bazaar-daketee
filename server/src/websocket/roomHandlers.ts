import {
  SOCKET_EVENTS,
  type IdentifyPayload,
  type IdentifyResult,
  type RoomCreateRequest,
  type RoomFillAiRequest,
  type RoomJoinRequest,
  type RoomKickRequest,
  type RoomLeaveRequest,
  type RoomReadyRequest,
  type RoomRematchRequest,
  type RoomRematchRespondRequest,
  type RoomStartRequest,
} from '@card-games/shared';
import type { Server } from 'socket.io';
import type { RoomManager } from '../rooms/RoomManager.js';
import { AppError } from '../utils/errors.js';
import { handleIdentify } from './identity.js';
import type { AppSocket } from './types.js';

function emitError(socket: AppSocket, error: unknown, fallbackMessage: string): void {
  if (error instanceof AppError) {
    socket.emit(SOCKET_EVENTS.ERROR, { code: error.code, message: error.message });
    return;
  }
  socket.emit(SOCKET_EVENTS.ERROR, { code: 'INTERNAL_ERROR', message: fallbackMessage });
}

function requireIdentity(socket: AppSocket): { userId: string; username: string } {
  if (!socket.data.userId) {
    throw new AppError('NOT_IDENTIFIED', 'You must identify before doing that.');
  }
  return { userId: socket.data.userId, username: socket.data.username };
}

export function registerRoomHandlers(
  io: Server,
  socket: AppSocket,
  roomManager: RoomManager,
  // Defaults to the real Prisma-backed identity flow — `localServer.ts`
  // (the phone-as-host, DB-free composition root) injects an in-memory
  // replacement instead. Every other caller is unaffected.
  identify: (socket: AppSocket, payload: IdentifyPayload) => Promise<IdentifyResult> = handleIdentify,
): void {
  socket.on(SOCKET_EVENTS.IDENTIFY, async (payload: IdentifyPayload) => {
    try {
      const result = await identify(socket, payload);
      socket.emit(SOCKET_EVENTS.IDENTIFIED, result);

      // If this user already has a live seat (page reload / dropped connection),
      // re-attach them automatically instead of requiring a separate resume call.
      const restored = roomManager.reattachIfReturning(result.userId, socket.id, result.username);
      if (restored) {
        socket.join(restored.code);
        socket.emit(SOCKET_EVENTS.ROOM_STATE, restored);
      }
    } catch (error) {
      emitError(socket, error, 'Could not identify you. Please try again.');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_CREATE, async (payload: RoomCreateRequest) => {
    try {
      const { userId, username } = requireIdentity(socket);
      const state = await roomManager.createRoom(
        { userId, username },
        payload.gameKey,
        payload.isPrivate,
        socket.id,
        payload.mode,
      );
      socket.join(state.code);
      socket.emit(SOCKET_EVENTS.ROOM_STATE, state);
    } catch (error) {
      emitError(socket, error, 'Could not create the room. Please try again.');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_JOIN, async (payload: RoomJoinRequest) => {
    try {
      const { userId, username } = requireIdentity(socket);
      const code = payload.code.toUpperCase();
      socket.join(code); // join first so the broadcast inside joinRoom reaches this socket too
      await roomManager.joinRoom(code, { userId, username }, socket.id);
    } catch (error) {
      socket.leave(payload.code.toUpperCase());
      emitError(socket, error, 'Could not join the room. Please try again.');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_READY, async (payload: RoomReadyRequest) => {
    try {
      const { userId } = requireIdentity(socket);
      await roomManager.setReady(payload.code, userId, payload.isReady);
    } catch (error) {
      emitError(socket, error, 'Could not update ready status.');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_START, async (payload: RoomStartRequest) => {
    try {
      const { userId } = requireIdentity(socket);
      await roomManager.startGame(payload.code, userId);
    } catch (error) {
      emitError(socket, error, 'Could not start the game.');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_LEAVE, async (payload: RoomLeaveRequest) => {
    try {
      const { userId } = requireIdentity(socket);
      await roomManager.leaveRoom(payload.code, userId);
      socket.leave(payload.code);
    } catch (error) {
      emitError(socket, error, 'Could not leave the room.');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_FILL_AI, async (payload: RoomFillAiRequest) => {
    try {
      const { userId } = requireIdentity(socket);
      await roomManager.addAIPlayer(payload.code, userId, {
        difficulty: payload.difficulty,
        personality: payload.personality,
      });
    } catch (error) {
      emitError(socket, error, 'Could not add an AI player.');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_REMATCH, async (payload: RoomRematchRequest) => {
    try {
      const { userId } = requireIdentity(socket);
      await roomManager.requestRematch(payload.code, userId);
    } catch (error) {
      emitError(socket, error, 'Could not request a rematch.');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_REMATCH_RESPOND, async (payload: RoomRematchRespondRequest) => {
    try {
      const { userId } = requireIdentity(socket);
      await roomManager.respondToRematch(payload.code, userId, payload.accept);
      if (!payload.accept) socket.leave(payload.code);
    } catch (error) {
      emitError(socket, error, 'Could not respond to the rematch.');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_KICK, async (payload: RoomKickRequest) => {
    try {
      const { userId } = requireIdentity(socket);
      const kickedSocketId = await roomManager.kickPlayer(payload.code, userId, payload.targetUserId);
      if (kickedSocketId) {
        io.sockets.sockets.get(kickedSocketId)?.leave(payload.code);
        io.to(kickedSocketId).emit(SOCKET_EVENTS.ROOM_CLOSED, { code: payload.code, reason: 'kicked' });
      }
    } catch (error) {
      emitError(socket, error, 'Could not remove that player.');
    }
  });

  socket.on('disconnect', () => {
    roomManager.handleSocketDisconnect(socket.id);
  });
}
