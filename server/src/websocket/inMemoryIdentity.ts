import { randomBytes } from 'node:crypto';
import type { IdentifyPayload, IdentifyResult } from '@card-games/shared';
import { AppError } from '../utils/errors.js';
import type { AppSocket } from './types.js';

interface StoredGuest {
  username: string;
  sessionToken: string;
}

function sanitizeUsername(raw: string): string {
  const trimmed = raw.trim().slice(0, 24);
  return trimmed || 'Guest';
}

/**
 * In-memory drop-in replacement for `identity.ts`'s `handleIdentify` — same
 * fresh-claim / resume-with-token / reject-mismatched-token behavior, just
 * backed by a plain `Map` instead of `prisma.user`/`userSession`/`profile`.
 * Used by `localServer.ts` (phone-as-host, no database at all). State lives
 * only as long as the process does — exactly right for an ephemeral
 * "everyone's in the same room right now" LAN session, nothing here needs
 * to survive a restart.
 */
export function createInMemoryIdentity(): (socket: AppSocket, payload: IdentifyPayload) => Promise<IdentifyResult> {
  const guests = new Map<string, StoredGuest>();

  return async function handleIdentifyInMemory(socket: AppSocket, payload: IdentifyPayload): Promise<IdentifyResult> {
    const username = sanitizeUsername(payload.username);
    const existing = guests.get(payload.guestId);

    if (!existing) {
      const sessionToken = randomBytes(32).toString('hex');
      guests.set(payload.guestId, { username, sessionToken });
      socket.data.userId = payload.guestId;
      socket.data.username = username;
      return { userId: payload.guestId, username, sessionToken };
    }

    if (payload.sessionToken && payload.sessionToken === existing.sessionToken) {
      existing.username = username;
      socket.data.userId = payload.guestId;
      socket.data.username = username;
      return { userId: payload.guestId, username, sessionToken: payload.sessionToken };
    }

    throw new AppError(
      'IDENTITY_CONFLICT',
      'That guest identity already exists and this session token does not match it.',
    );
  };
}
