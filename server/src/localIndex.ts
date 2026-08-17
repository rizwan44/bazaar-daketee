import { startLocalServer } from './localServer.js';

// Thin, always-executing entrypoint — same pattern as `index.ts`, the real
// server's own entrypoint. `localServer.ts` stays a pure, side-effect-free
// library (`startLocalServer`) so Area D can also import and call it
// directly from inside the embedded on-device runtime without this file's
// process.env-reading being in the way.
const port = Number(process.env.PORT) || 4790;
startLocalServer(port);
