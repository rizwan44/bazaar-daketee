import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { fourCardAdapter } from './game/adapters/fourCardAdapter.js';
import { GameSessionManager } from './game/GameSessionManager.js';
import { InMemoryGamePersistence } from './game/InMemoryGamePersistence.js';
import { healthRouter } from './rest/health.js';
import { InMemoryRoomPersistence } from './rooms/InMemoryRoomPersistence.js';
import { RoomManager } from './rooms/RoomManager.js';
import { logger } from './utils/logger.js';
import { createInMemoryIdentity } from './websocket/inMemoryIdentity.js';
import { registerGameHandlers } from './websocket/gameHandlers.js';
import { registerRoomHandlers } from './websocket/roomHandlers.js';
import type { AppSocket } from './websocket/types.js';

/**
 * A fully self-contained, database-free composition root — the phone-as-host
 * counterpart to `index.ts`/`app.ts`/`gateway.ts` (which stay untouched and
 * keep requiring a real MySQL). Deliberately never imports `config/env.ts`
 * or `db/prisma.ts`: every dependency this file wires up is either a plain
 * in-memory implementation (`InMemoryRoomPersistence`,
 * `InMemoryGamePersistence`, `createInMemoryIdentity`) or already
 * env-independent (`healthRouter`, `logger`). Registers only `fourCardAdapter`
 * — Teen Patti's DB-bound coin economy is out of scope here (see the Android
 * app plan's Area C). Runnable directly for local testing
 * (`npm run dev:local --workspace=server`) and reusable as a library
 * (`startLocalServer`) once Area D embeds this inside the Android app.
 */
function getLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) addresses.push(info.address);
    }
  }
  return addresses;
}

function createLocalApp(port: number): Express {
  const app = express();

  // LAN-only, ephemeral, never internet-facing — unlike the real hosted
  // server's strict origin allowlist (config/cors.ts), any origin is fine
  // here (also sidesteps needing env.ts's CLIENT_ORIGIN, which this whole
  // file deliberately never imports).
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  app.use('/api', healthRouter);
  app.get('/api/network-info', (_req, res) => {
    res.json({ lanAddresses: getLanAddresses(), port });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('local.http.unhandled_error', { error: err.message, path: req.path });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

export function startLocalServer(port: number): ReturnType<typeof createServer> {
  const app = createLocalApp(port);
  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, { cors: { origin: true, credentials: true } });
  const identify = createInMemoryIdentity();

  let roomManagerRef: RoomManager;

  const gameSessionManager = new GameSessionManager({
    persistence: new InMemoryGamePersistence(),
    emitToSocket: (socketId, event, payload) => io.to(socketId).emit(event, payload),
    adapters: [fourCardAdapter],
    onSessionEnded: (roomCode, info) => {
      void roomManagerRef.closeRoomAfterGame(roomCode, info);
    },
  });

  const roomManager = new RoomManager({
    persistence: new InMemoryRoomPersistence(),
    broadcast: (code, event, payload) => io.to(code).emit(event, payload),
    onGameStarted: (info) => gameSessionManager.startSession(info),
  });
  roomManagerRef = roomManager;

  io.on('connection', (socket: AppSocket) => {
    logger.info('local.socket.connected', { socketId: socket.id });

    socket.on('ping', (payload: unknown) => {
      socket.emit('pong', { receivedAt: new Date().toISOString(), echo: payload });
    });

    registerRoomHandlers(io, socket, roomManager, identify);
    registerGameHandlers(socket, gameSessionManager);

    socket.on('disconnect', (reason) => {
      logger.info('local.socket.disconnected', { socketId: socket.id, reason });
    });
  });

  httpServer.listen(port, () => {
    logger.info('local.server.started', { port, lanAddresses: getLanAddresses() });
  });

  return httpServer;
}
