import { createHash, randomBytes } from 'node:crypto';
import type { IdentifyPayload, IdentifyResult } from '@card-games/shared';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import type { AppSocket } from './types.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const STARTING_COIN_BALANCE = 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sanitizeUsername(raw: string): string {
  const trimmed = raw.trim().slice(0, 24);
  return trimmed || 'Guest';
}

async function issueFreshIdentity(userId: string, username: string): Promise<IdentifyResult> {
  await prisma.user.create({
    data: { id: userId, username: `guest_${userId.slice(0, 8)}`, isGuest: true },
  });
  await prisma.profile.create({ data: { userId, displayName: username, coins: STARTING_COIN_BALANCE } });

  const rawToken = randomBytes(32).toString('hex');
  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { userId, username, sessionToken: rawToken };
}

/**
 * Resolves a client's `identify` call into a server-trusted identity.
 *
 * A brand-new guestId is claimed outright (guest accounts need no password).
 * A guestId that already belongs to someone can only be resumed by presenting
 * the session token that was issued for it — without one, we refuse to just
 * let a caller assert someone else's identity.
 */
export async function handleIdentify(socket: AppSocket, payload: IdentifyPayload): Promise<IdentifyResult> {
  const username = sanitizeUsername(payload.username);
  const existingUser = await prisma.user.findUnique({ where: { id: payload.guestId } });

  if (!existingUser) {
    const result = await issueFreshIdentity(payload.guestId, username);
    socket.data.userId = result.userId;
    socket.data.username = result.username;
    return result;
  }

  if (payload.sessionToken) {
    const session = await prisma.userSession.findFirst({
      where: {
        userId: existingUser.id,
        tokenHash: hashToken(payload.sessionToken),
        expiresAt: { gt: new Date() },
      },
    });
    if (session) {
      await prisma.profile.upsert({
        where: { userId: existingUser.id },
        update: { displayName: username },
        create: { userId: existingUser.id, displayName: username, coins: STARTING_COIN_BALANCE },
      });
      await prisma.user.update({ where: { id: existingUser.id }, data: { lastLoginAt: new Date() } });
      socket.data.userId = existingUser.id;
      socket.data.username = username;
      return { userId: existingUser.id, username, sessionToken: payload.sessionToken };
    }
  }

  throw new AppError(
    'IDENTITY_CONFLICT',
    'That guest identity already exists and this session token does not match it.',
  );
}
