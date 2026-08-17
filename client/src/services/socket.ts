import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useConnectionStore } from '../store/connectionStore';

let socket: Socket | null = null;
let socketUrl: string | null = null;

/**
 * Lazily creates a single shared Socket.IO connection for the whole app,
 * pointed at whichever server `connectionStore` currently holds. If the
 * target server changes (joining a LAN room via QR link swaps it), the old
 * connection is torn down and a fresh one opened against the new address.
 */
export function getSocket(): Socket {
  const targetUrl = useConnectionStore.getState().serverUrl;
  if (socket && socketUrl !== targetUrl) {
    socket.disconnect();
    socket = null;
  }
  if (!socket) {
    socket = io(targetUrl, { autoConnect: true });
    socketUrl = targetUrl;
  }
  return socket;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Proof-of-pipeline hook: connects to the server and round-trips a
 * ping/pong event so the UI can show a live "connected" indicator.
 */
export function useSocketPing(): { status: ConnectionStatus; lastPongAt: string | null } {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastPongAt, setLastPongAt] = useState<string | null>(null);

  useEffect(() => {
    const s = getSocket();

    const onConnect = () => {
      setStatus('connected');
      s.emit('ping', { from: 'client-shell' });
    };
    const onDisconnect = () => setStatus('disconnected');
    const onPong = (data: { receivedAt: string }) => setLastPongAt(data.receivedAt);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('pong', onPong);

    if (s.connected) onConnect();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('pong', onPong);
    };
  }, []);

  return { status, lastPongAt };
}
