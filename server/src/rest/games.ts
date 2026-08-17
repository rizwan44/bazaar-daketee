import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

export const gamesRouter = Router();

gamesRouter.get('/games', async (_req, res) => {
  try {
    const games = await prisma.game.findMany({ orderBy: { name: 'asc' } });
    res.json({ games });
  } catch (error) {
    logger.error('games.list_failed', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
