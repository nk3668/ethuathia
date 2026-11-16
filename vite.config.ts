import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Offline-only is a hard constraint (CLAUDE.md §9), so the built app carries a
 * Content-Security-Policy that makes the browser or webview refuse anything not shipped
 * in the bundle. It is applied to builds only: the dev server needs inline scripts and a
 * websocket for hot reload.
 */
const OFFLINE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function offlineCsp(): Plugin {
  return {
    name: 'ethuathia:offline-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: OFFLINE_CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineCsp()],
  // The sim worker (src/ui/host/sim.worker.ts) is a module worker, bundled like the app.
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
