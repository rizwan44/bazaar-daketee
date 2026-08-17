import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { corsOriginHandler } from '../config/cors.js';
import { prisma } from '../db/prisma.js';
import { fourCardAdapter } from '../game/adapters/fourCardAdapter.js';
import { teenPattiAdapter } from '../game/adapters/teenPattiAdapter.js';
import { GameSessionManager } from '../game/GameSessionManager.js';
import { PrismaGamePersistence } from '../game/PrismaGamePersistence.js';
import { PrismaRoomPersistence } from '../rooms/PrismaRoomPersistence.js';
import { RoomManager } from '../rooms/RoomManager.js';
import { logger } from '../utils/logger.js';
import { registerGameHandlers } from './gameHandlers.js';
import { registerRoomHandlers } from './roomHandlers.js';
import type { AppSocket } from './types.js';

export function createWebSocketGateway(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOriginHandler,
      credentials: true,
    },
  });

  // gameSessionManager and roomManager each need a hook into the other
  // (game-started -> start a session; session-ended -> close the room), so
  // one has to be constructed with a callback that closes over a
  // not-yet-assigned reference to the other. Safe because neither callback
  // actually fires until well after both are constructed below.
  let roomManagerRef: RoomManager;

  const gameSessionManager = new GameSessionManager({
    persistence: new PrismaGamePersistence(prisma),
    emitToSocket: (socketId, event, payload) => io.to(socketId).emit(event, payload),
    adapters: [teenPattiAdapter, fourCardAdapter],
    onSessionEnded: (roomCode, info) => {
      void roomManagerRef.closeRoomAfterGame(roomCode, info);
    },
  });

  const roomManager = new RoomManager({
    persistence: new PrismaRoomPersistence(prisma),
    broadcast: (code, event, payload) => io.to(code).emit(event, payload),
    onGameStarted: (info) => gameSessionManager.startSession(info),
  });
  roomManagerRef = roomManager;

  io.on('connection', (socket: AppSocket) => {
    logger.info('socket.connected', { socketId: socket.id });

    socket.on('ping', (payload: unknown) => {
      socket.emit('pong', { receivedAt: new Date().toISOString(), echo: payload });
    });

    registerRoomHandlers(io, socket, roomManager);
    registerGameHandlers(socket, gameSessionManager);

    socket.on('disconnect', (reason) => {
      logger.info('socket.disconnected', { socketId: socket.id, reason });
    });
  });

  return io;
}
