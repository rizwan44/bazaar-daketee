import { useSettingsStore } from '../store/settingsStore';

export type SfxEvent = 'draw' | 'collect' | 'discard' | 'deal' | 'turnStart' | 'turnComplete' | 'gameComplete' | 'win';

/**
 * No audio asset files exist in this repo and sourcing licensed recordings
 * isn't practical here, so every cue is a short, clean tone synthesized via
 * the Web Audio API instead of a bundled file — self-contained (works fully
 * offline too, matching the app's LAN-hosting goal), at the cost of not
 * being real recorded "card slide" audio. Kept deliberately quiet and short
 * per §7's "short, clean, natural — not annoying" instruction.
 */
interface Tone {
  freq: number;
  durationMs: number;
  type: OscillatorType;
  gain: number;
}

const TONES: Record<SfxEvent, Tone[]> = {
  draw: [{ freq: 480, durationMs: 70, type: 'triangle', gain: 0.12 }],
  collect: [
    { freq: 660, durationMs: 55, type: 'sine', gain: 0.14 },
    { freq: 880, durationMs: 90, type: 'sine', gain: 0.12 },
  ],
  discard: [{ freq: 300, durationMs: 60, type: 'triangle', gain: 0.09 }],
  deal: [{ freq: 420, durationMs: 45, type: 'triangle', gain: 0.08 }],
  turnStart: [{ freq: 520, durationMs: 90, type: 'sine', gain: 0.07 }],
  turnComplete: [{ freq: 340, durationMs: 70, type: 'sine', gain: 0.07 }],
  gameComplete: [
    { freq: 440, durationMs: 120, type: 'triangle', gain: 0.14 },
    { freq: 550, durationMs: 140, type: 'triangle', gain: 0.14 },
  ],
  win: [
    { freq: 523, durationMs: 110, type: 'sine', gain: 0.16 },
    { freq: 659, durationMs: 110, type: 'sine', gain: 0.16 },
    { freq: 784, durationMs: 180, type: 'sine', gain: 0.18 },
  ],
};

let audioContext: AudioContext | null = null;

/** Lazily constructs the shared AudioContext on first use — browsers require it to originate from a user gesture, so calling this eagerly on load would fail silently anyway. This IS the "preloading": one context, reused for every cue, no per-call setup cost. */
function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

function playTone(ctx: AudioContext, tone: Tone, startAt: number, freqMultiplier: number): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = tone.type;
  osc.frequency.value = tone.freq * freqMultiplier;
  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(tone.gain, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.durationMs / 1000);
  osc.connect(gainNode).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + tone.durationMs / 1000 + 0.02);
}

/**
 * Gated by Settings → Sound Effects (`soundEnabled`); a no-op otherwise.
 * `jitter` (0-1) applies a small random pitch variance — used for repeated
 * rapid-fire cues like the deal-in stagger (§27's "small natural variation
 * so it does not sound robotic") — omit for normal one-off cues.
 */
export function playSfx(event: SfxEvent, jitter = 0): void {
  if (!useSettingsStore.getState().soundEnabled) return;
  const ctx = getContext();
  if (!ctx) return;

  const freqMultiplier = jitter > 0 ? 1 + (Math.random() * 2 - 1) * jitter : 1;
  let t = ctx.currentTime;
  for (const tone of TONES[event]) {
    playTone(ctx, tone, t, freqMultiplier);
    t += tone.durationMs / 1000 + 0.02;
  }
}

/** Gated by Settings → Vibration (`vibrationEnabled`); a no-op on unsupported devices/browsers. */
export function vibrate(pattern: number | number[]): void {
  if (!useSettingsStore.getState().vibrationEnabled) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}
