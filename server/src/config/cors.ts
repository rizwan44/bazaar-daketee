import { env } from './env.js';

// Same trust level as localhost: on a LAN, the device running this server
// IS the trusted host for that session — there's no separate "cloud" origin
// to protect against here. A real cloud deployment would tighten this back
// down to an explicit origin allowlist.
const PRIVATE_LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / non-browser requests (curl, server-to-server)
  if (origin === env.CLIENT_ORIGIN) return true;
  return PRIVATE_LAN_ORIGIN.test(origin);
}

export const corsOriginHandler = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void => {
  callback(null, isAllowedOrigin(origin));
};
