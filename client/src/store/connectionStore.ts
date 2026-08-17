import { create } from 'zustand';

interface ConnectionState {
  /** Which server this client's socket should connect to — overridden when joining a LAN room via QR link. */
  serverUrl: string;
  guestId: string;
  username: string;
  /** Set once the server confirms `identify`; required to resume this identity after a reconnect. */
  sessionToken: string | null;
  setServerUrl: (url: string) => void;
  setUsername: (name: string) => void;
  setSessionToken: (token: string) => void;
}

const STORAGE_KEY = 'card-games:connection';
const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4790';

interface Persisted {
  serverUrl: string;
  guestId: string;
  username: string;
  sessionToken: string | null;
}

function randomUsername(): string {
  return `Guest${Math.floor(1000 + Math.random() * 9000)}`;
}

function readInitial(): Persisted {
  if (typeof window === 'undefined') {
    return { serverUrl: DEFAULT_SERVER_URL, guestId: '', username: randomUsername(), sessionToken: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>;
      return {
        serverUrl: parsed.serverUrl ?? DEFAULT_SERVER_URL,
        guestId: parsed.guestId ?? crypto.randomUUID(),
        username: parsed.username ?? randomUsername(),
        sessionToken: parsed.sessionToken ?? null,
      };
    }
  } catch {
    // fall through to a fresh identity below
  }
  return {
    serverUrl: DEFAULT_SERVER_URL,
    guestId: crypto.randomUUID(),
    username: randomUsername(),
    sessionToken: null,
  };
}

function persist(state: Persisted): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const initial = readInitial();
if (typeof window !== 'undefined') persist(initial);

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  ...initial,
  setServerUrl: (serverUrl) => {
    set({ serverUrl });
    persist({ ...get(), serverUrl });
  },
  setUsername: (username) => {
    set({ username });
    persist({ ...get(), username });
  },
  setSessionToken: (sessionToken) => {
    set({ sessionToken });
    persist({ ...get(), sessionToken });
  },
}));
