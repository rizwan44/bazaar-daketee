import { networkInterfaces } from 'node:os';
import { Router } from 'express';
import { env } from '../config/env.js';

export const networkRouter = Router();

function getLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        addresses.push(info.address);
      }
    }
  }
  return addresses;
}

// Used by the "Host on this device (LAN)" flow to build a joinable QR code —
// the client embeds one of these addresses so another device on the same
// WiFi can reach this server without any internet connection.
networkRouter.get('/network-info', (_req, res) => {
  res.json({ lanAddresses: getLanAddresses(), port: env.PORT });
});
