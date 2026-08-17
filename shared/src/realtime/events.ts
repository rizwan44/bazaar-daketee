/**
 * Single source of truth for Socket.IO event names shared between client and
 * server, so a typo can't silently create two events that never talk to
 * each other.
 */
export const SOCKET_EVENTS = {
  // client -> server
  IDENTIFY: 'identify',
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_READY: 'room:ready',
  ROOM_START: 'room:start',
  ROOM_KICK: 'room:kick',
  ROOM_FILL_AI: 'room:fillAI',
  ROOM_REMATCH: 'room:rematch',
  ROOM_REMATCH_RESPOND: 'room:rematchRespond',
  GAME_JOIN: 'game:join',
  GAME_MOVE: 'game:move',

  // server -> client
  IDENTIFIED: 'identified',
  ROOM_STATE: 'room:state',
  ROOM_STARTED: 'room:started',
  ROOM_CLOSED: 'room:closed',
  GAME_STATE: 'game:state',
  GAME_ENDED: 'game:ended',
  ERROR: 'error',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
