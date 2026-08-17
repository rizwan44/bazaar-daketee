import { describe, expect, it } from 'vitest';
import { createInMemoryIdentity } from './inMemoryIdentity.js';
import type { AppSocket } from './types.js';

function fakeSocket(): AppSocket {
  return { data: {} } as AppSocket;
}

describe('createInMemoryIdentity', () => {
  it('claims a brand-new guestId outright, no password needed', async () => {
    const identify = createInMemoryIdentity();
    const socket = fakeSocket();

    const result = await identify(socket, { guestId: 'guest-1', username: 'Alice' });

    expect(result.userId).toBe('guest-1');
    expect(result.username).toBe('Alice');
    expect(result.sessionToken).toBeTruthy();
    expect(socket.data.userId).toBe('guest-1');
    expect(socket.data.username).toBe('Alice');
  });

  it('resumes an existing guestId when the correct session token is presented', async () => {
    const identify = createInMemoryIdentity();
    const first = await identify(fakeSocket(), { guestId: 'guest-1', username: 'Alice' });

    const resumed = await identify(fakeSocket(), {
      guestId: 'guest-1',
      username: 'Alice (renamed)',
      sessionToken: first.sessionToken,
    });

    expect(resumed.userId).toBe('guest-1');
    expect(resumed.username).toBe('Alice (renamed)');
  });

  it('rejects a guestId that already exists when no/wrong session token is presented', async () => {
    const identify = createInMemoryIdentity();
    await identify(fakeSocket(), { guestId: 'guest-1', username: 'Alice' });

    await expect(identify(fakeSocket(), { guestId: 'guest-1', username: 'Eve' })).rejects.toThrow();
    await expect(
      identify(fakeSocket(), { guestId: 'guest-1', username: 'Eve', sessionToken: 'wrong-token' }),
    ).rejects.toThrow();
  });

  it('sanitizes an empty/whitespace username to "Guest"', async () => {
    const identify = createInMemoryIdentity();
    const result = await identify(fakeSocket(), { guestId: 'guest-2', username: '   ' });
    expect(result.username).toBe('Guest');
  });
});
