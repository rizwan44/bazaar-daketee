import { Capacitor } from '@capacitor/core';

/** True when running inside the packaged Android (or iOS) app shell, false in a regular browser/PWA. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
