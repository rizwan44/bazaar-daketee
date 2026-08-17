import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // The PWA service worker (auto-update polling against a real deployed
    // origin) is meaningless — and actively risky (stale bundled-asset
    // caching) — inside a Capacitor WebView loading assets packaged into the
    // APK itself, where there's no real update channel to poll. Only the
    // web/PWA build (`npm run build`, default mode) gets it; the Capacitor
    // build (`npm run build:capacitor`, mode=capacitor) skips it entirely.
    mode !== 'capacitor' &&
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          name: '52 Card Games',
          short_name: 'CardGames',
          description: 'Real-time online 52-card game platform',
          theme_color: '#0b3d2e',
          background_color: '#0b3d2e',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
  ],
  server: {
    port: 5173,
    // Bind all interfaces (not just localhost) so a phone on the same WiFi
    // can load the app for LAN play — see LanQrPanel in RoomScreen.
    host: true,
  },
  test: {
    // The zustand stores (connectionStore etc.) read `localStorage` at
    // module init for their `persist` middleware — vitest's default 'node'
    // environment has no such global, so every test importing a store
    // (directly or transitively) would crash before even running.
    environment: 'jsdom',
  },
}));
