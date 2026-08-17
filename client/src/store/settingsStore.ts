import { create } from 'zustand';

interface SettingsState {
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrationEnabled: boolean;
  volume: number;
  toggleSound: () => void;
  toggleMusic: () => void;
  toggleVibration: () => void;
  setVolume: (volume: number) => void;
}

const STORAGE_KEY = 'card-games:settings';

interface PersistedSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrationEnabled: boolean;
  volume: number;
}

const defaults: PersistedSettings = {
  soundEnabled: true,
  musicEnabled: false, // no music track exists yet — matches §13's explicit default
  vibrationEnabled: true,
  volume: 80,
};

function readInitial(): PersistedSettings {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

function persist(state: PersistedSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const initial = readInitial();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...initial,
  toggleSound: () => {
    const soundEnabled = !get().soundEnabled;
    set({ soundEnabled });
    persist({ ...get(), soundEnabled });
  },
  toggleMusic: () => {
    const musicEnabled = !get().musicEnabled;
    set({ musicEnabled });
    persist({ ...get(), musicEnabled });
  },
  toggleVibration: () => {
    const vibrationEnabled = !get().vibrationEnabled;
    set({ vibrationEnabled });
    persist({ ...get(), vibrationEnabled });
  },
  setVolume: (volume) => {
    set({ volume });
    persist({ ...get(), volume });
  },
}));
