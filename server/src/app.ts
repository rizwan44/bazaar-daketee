import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { corsOriginHandler } from './config/cors.js';
import { gamesRouter } from './rest/games.js';
import { healthRouter } from './rest/health.js';
import { networkRouter } from './rest/network.js';
import { logger } from './utils/logger.js';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: corsOriginHandler, credentials: true }));
  app.use(express.json());

  app.use('/api', healthRouter);
  app.use('/api', gamesRouter);
  app.use('/api', networkRouter);

  // Catches anything that fell through above; keeps raw errors out of responses.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('http.unhandled_error', { error: err.message, path: req.path });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
