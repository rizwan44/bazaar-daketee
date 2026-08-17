import type { Socket } from 'socket.io';

export interface SocketData {
  userId: string;
  username: string;
}

/** Socket typed only for the `data` bag we attach after a successful identify. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppSocket = Socket<any, any, any, SocketData>;
