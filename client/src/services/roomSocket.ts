import {
  SOCKET_EVENTS,
  type AIConfig,
  type IdentifyResult,
  type RoomClosedPayload,
  type RoomErrorPayload,
  type RoomStartedPayload,
  type RoomStatePayload,
} from '@card-games/shared';
import { isLocalSessionActive, leaveLocalGame, requestLocalRematch } from '../local/LocalGameSession';
import { useConnectionStore } from '../store/connectionStore';
import { useRoomStore } from '../store/roomStore';
import { getSocket } from './socket';

let listenersRegistered = false;

function identify(): void {
  const { guestId, username, sessionToken } = useConnectionStore.getState();
  getSocket().emit(SOCKET_EVENTS.IDENTIFY, { guestId, username, sessionToken: sessionToken ?? undefined });
}

/**
 * Wires the room-related socket events to `roomStore` exactly once. Safe to
 * call from every screen that needs room state — subsequent calls are no-ops
 * so listeners are never duplicated.
 */
export function ensureRoomSocketReady(): void {
  // A local game already writes its own room/session state directly (see
  // LocalGameSession.ts) — no identify handshake or socket listeners needed.
  if (isLocalSessionActive()) return;
  const socket = getSocket();
  if (listenersRegistered) {
    if (socket.connected && !useRoomStore.getState().identified) identify();
    return;
  }
  listenersRegistered = true;

  socket.on('connect', identify);

  socket.on(SOCKET_EVENTS.IDENTIFIED, (result: IdentifyResult) => {
    useRoomStore.getState().setIdentified(result.userId);
    const store = useConnectionStore.getState();
    if (result.sessionToken !== store.sessionToken) store.setSessionToken(result.sessionToken);
  });

  socket.on(SOCKET_EVENTS.ROOM_STATE, (state: RoomStatePayload) => {
    useRoomStore.getState().setRoom(state);
  });

  socket.on(SOCKET_EVENTS.ROOM_STARTED, (payload: RoomStartedPayload) => {
    useRoomStore.getState().setStartedSession(payload);
  });

  socket.on(SOCKET_EVENTS.ROOM_CLOSED, (payload: RoomClosedPayload) => {
    useRoomStore.getState().setClosed(payload);
  });

  socket.on(SOCKET_EVENTS.ERROR, (payload: RoomErrorPayload) => {
    useRoomStore.getState().setError(payload);
  });

  if (socket.connected) identify();
}

export function createRoom(gameKey: string, isPrivate: boolean, mode?: string): void {
  getSocket().emit(SOCKET_EVENTS.ROOM_CREATE, { gameKey, isPrivate, mode });
}

export function joinRoom(code: string): void {
  getSocket().emit(SOCKET_EVENTS.ROOM_JOIN, { code: code.trim().toUpperCase() });
}

export function setReady(code: string, isReady: boolean): void {
  getSocket().emit(SOCKET_EVENTS.ROOM_READY, { code, isReady });
}

export function startGame(code: string): void {
  getSocket().emit(SOCKET_EVENTS.ROOM_START, { code });
}

export function leaveRoom(code: string): void {
  if (isLocalSessionActive()) {
    leaveLocalGame();
    return;
  }
  getSocket().emit(SOCKET_EVENTS.ROOM_LEAVE, { code });
  useRoomStore.getState().clearRoom();
}

export function kickPlayer(code: string, targetUserId: string): void {
  getSocket().emit(SOCKET_EVENTS.ROOM_KICK, { code, targetUserId });
}

export function fillAI(code: string, config: AIConfig): void {
  getSocket().emit(SOCKET_EVENTS.ROOM_FILL_AI, { code, ...config });
}

/** Requests a rematch on a finished, rematch-capable room — same seats, new game session. Other players respond via `respondToRematch`. */
export function requestRematch(code: string): void {
  if (isLocalSessionActive()) {
    // No other real players to ask — a local rematch just starts immediately.
    requestLocalRematch();
    return;
  }
  getSocket().emit(SOCKET_EVENTS.ROOM_REMATCH, { code });
}

export function respondToRematch(code: string, accept: boolean): void {
  getSocket().emit(SOCKET_EVENTS.ROOM_REMATCH_RESPOND, { code, accept });
}
