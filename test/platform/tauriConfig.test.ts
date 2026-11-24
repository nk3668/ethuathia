import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const TAURI_DIR = join(ROOT, 'src-tauri');

interface TauriConfig {
  productName?: string;
  version?: string;
  identifier?: string;
  build?: {
    beforeDevCommand?: string;
    devUrl?: string;
    beforeBuildCommand?: string;
    frontendDist?: string;
  };
  app?: {
    security?: {
      csp?: string;
    };
  };
  bundle?: {
    active?: boolean;
    icon?: string[];
  };
}

interface TauriCapability {
  identifier?: string;
  windows?: string[];
  permissions?: string[];
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('Tauri offline packaging invariants', () => {
  const tauriConf = JSON.parse(readFileSync(join(TAURI_DIR, 'tauri.conf.json'), 'utf8')) as TauriConfig;
  const capability = JSON.parse(
    readFileSync(join(TAURI_DIR, 'capabilities', 'default.json'), 'utf8'),
  ) as TauriCapability;
  const cargoToml = readFileSync(join(TAURI_DIR, 'Cargo.toml'), 'utf8');

  it('builds and serves from the local Vite bundle and configures all icon files', () => {
    expect(tauriConf.build?.frontendDist).toBe('../dist');
    expect(tauriConf.build?.beforeBuildCommand).toBe('npm run build');
    expect(tauriConf.build?.beforeDevCommand).toBe('npm run dev');
    expect(tauriConf.build?.devUrl).toBe('http://localhost:1420');
    expect(tauriConf.bundle?.active).toBe(true);

    const icons = tauriConf.bundle?.icon ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(existsSync(join(TAURI_DIR, icon)), `missing icon ${icon}`).toBe(true);
    }
  });

  it('enforces a strict offline CSP without remote origins', () => {
    const csp = tauriConf.app?.security?.csp ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("connect-src 'self' ipc: http://ipc.localhost");

    // Strip the local Tauri IPC bridge origin before checking for any remote/wildcard sources.
    const withoutLocalIpc = csp.replace(/\bhttp:\/\/ipc\.localhost\b/g, '');
    expect(withoutLocalIpc).not.toMatch(/https?:\/\//i);
    expect(withoutLocalIpc).not.toMatch(/wss?:\/\//i);
    expect(withoutLocalIpc).not.toContain('*');
  });

  it('grants only minimal core + window-destroy permissions in capabilities', () => {
    expect(capability.identifier).toBe('default');
    expect(capability.windows).toContain('main');
    const permissions = capability.permissions ?? [];
    expect(permissions).toContain('core:default');
    expect(permissions).toContain('core:window:allow-destroy');

    for (const perm of permissions) {
      expect(perm).not.toMatch(/^(http|net|fs|shell|opener|websocket|process)/i);
      expect(perm).not.toMatch(/:.*(http|net|fetch|fs|shell|opener|websocket)/i);
    }
  });

  it('does not depend on network, filesystem, shell, or opener Rust plugins', () => {
    expect(cargoToml).not.toMatch(/tauri-plugin-(http|fs|shell|opener|websocket|updater)/i);
    expect(cargoToml).not.toMatch(/\b(reqwest|hyper|ureq|surf|isahc|tokio-tungstenite)\b/i);
  });

  it('keeps all @tauri-apps/api imports inside src/platform/', () => {
    const srcFiles = listTsFiles(join(ROOT, 'src'));
    const platformDir = join(ROOT, 'src', 'platform');
    for (const file of srcFiles) {
      if (file.startsWith(platformDir)) continue;
      const content = readFileSync(file, 'utf8');
      expect(content, `${file} must not import @tauri-apps/api outside src/platform/`).not.toMatch(
        /@tauri-apps\/api/,
      );
    }
  });
});
