import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { createWebSocketGateway } from './websocket/gateway.js';

const app = createApp();
const httpServer = createServer(app);
createWebSocketGateway(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info('server.started', { port: env.PORT, env: env.NODE_ENV });
});
