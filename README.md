# Ethuathia

An offline-only idle dungeon crawler inspired by Roguathia. A party of adventurers explores a procedurally generated dungeon on its own, guided by ordered behavior rules and a built-in exploration AI, while you build up a town, unlock classes and upgrades, and grow a lineage across runs.

## Development

Install dependencies (Node.js `^20.19.0 || ^22.13.0 || >=24`):

```sh
npm install
```

Common commands:

- `npm run dev` — start the Vite dev server for running in a browser tab
- `npm run build` — typecheck and build the static frontend bundle into `dist/`
- `npm run check` — run `typecheck`, `lint`, and the full Vitest suite
- `npm run validate:content` — validate content definitions
- `npm run sim -- --seeds 100` — run headless seeded simulation checks

See [`CLAUDE.md`](CLAUDE.md) for the full design and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for technical architecture.

## Building the desktop app

Ethuathia packages with **Tauri v2** (`src-tauri/`) as a standalone, offline-only desktop application.

### Prerequisites

- **Node.js** (`^20.19.0 || ^22.13.0 || >=24`) and npm
- **Rust toolchain** (`rustup` and `cargo`)
- **Platform Tauri v2 dependencies:**
  - **Windows:** Microsoft Visual Studio C++ Build Tools (MSVC linker) and WebView2 Runtime (preinstalled on Windows 10/11)
  - **macOS:** Xcode Command Line Tools
  - **Linux:** `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, and standard build tools (`build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`)

### Running and building

- **Desktop dev mode:**
  ```sh
  npm run tauri dev
  ```
  Starts the Vite dev server on `http://localhost:1420` and opens the Tauri desktop window.

- **Desktop release build & installers:**
  ```sh
  npm run tauri build
  ```
  Runs `npm run build` (`dist/`), compiles `src-tauri/`, and emits installers under `src-tauri/target/release/bundle/` (for example `nsis/*.exe` and `msi/*.msi` on Windows, `.app`/`.dmg` on macOS, and `.deb`/`.AppImage`/`.rpm` on Linux). On deeply nested Windows checkout paths, set `CARGO_TARGET_DIR` to a shorter directory (for example `$env:TEMP\ethuathia-target`) to avoid MSVC `LNK1104` (`MAX_PATH`) linker errors.

### Save file location

- **Desktop app (Tauri):** Saves are written atomically (`save.json.tmp` → `save.json`) to Tauri's `app_data_dir` for identifier `com.ethuathia.app`:
  - **Windows:** `%APPDATA%\com.ethuathia.app\save.json`
  - **macOS:** `~/Library/Application Support/com.ethuathia.app/save.json`
  - **Linux:** `$XDG_DATA_HOME/com.ethuathia.app/save.json` (default `~/.local/share/com.ethuathia.app/save.json`)
- **Browser dev tab:** Continues to store saves locally in IndexedDB (`ethuathia` / `saves` / `profile`).
- **Autosave on close:** Closing the desktop window intercepts `onCloseRequested`, awaits pending save writes to `save.json`, and then destroys the window.

### Offline-only guarantees

- Zero network, HTTP, filesystem-plugin, shell, or opener plugins in `src-tauri/Cargo.toml`.
- `src-tauri/capabilities/default.json` grants only `core:default` and `core:window:allow-destroy`.
- `src-tauri/tauri.conf.json` enforces a strict Content Security Policy restricting all origins to `'self'` (plus Tauri's local `ipc:` / `http://ipc.localhost` IPC bridge; browser builds retain the stricter `connect-src 'self'` meta CSP).
- Fonts (`@fontsource/inter`, `@fontsource/jetbrains-mono`) and their SIL OFL 1.1 license files (`dist/licenses/`) are bundled locally in the app.
