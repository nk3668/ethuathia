import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
      // Under Tauri, tauri.conf.json's `app.security.csp` is authoritative (allowing the local IPC
      // bridge); browser builds keep the stricter meta tag.
      if (process.env.TAURI_ENV_PLATFORM !== undefined) return [];
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

/** Bundled fonts and the license text that must travel with them (SIL OFL 1.1). */
const FONT_LICENSES = [
  { pkg: '@fontsource/inter', file: 'Inter-OFL.txt' },
  { pkg: '@fontsource/jetbrains-mono', file: 'JetBrainsMono-OFL.txt' },
];

/**
 * The OFL requires each font's license to ship with it, so the build copies both license texts
 * from the npm packages into `dist/licenses/`.
 */
function fontLicenses(): Plugin {
  const require = createRequire(import.meta.url);
  return {
    name: 'ethuathia:font-licenses',
    apply: 'build',
    generateBundle() {
      for (const { pkg, file } of FONT_LICENSES) {
        this.emitFile({
          type: 'asset',
          fileName: `licenses/${file}`,
          source: readFileSync(require.resolve(`${pkg}/LICENSE`)),
        });
      }
    },
  };
}

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  plugins: [react(), offlineCsp(), fontLicenses()],
  // The sim worker (src/ui/host/sim.worker.ts) is a module worker, bundled like the app.
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    // Seed sweeps (the soak, 100-floor exploration) take a few seconds alone and can pass 5 s
    // when the whole suite runs in parallel on a busy machine.
    testTimeout: 20_000,
  },
});
