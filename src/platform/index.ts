/**
 * platform: storage and window adapters.
 * May import: core, and types from meta. See docs/ARCHITECTURE.md §1 and §6.5.
 */
export { AUTOSAVE_INTERVAL_MS, startAutosave } from './autosave';
export type { AutosaveOptions, AutosaveTarget } from './autosave';
export { downloadTextFile, readTextFile } from './files';
export { createSaveStore, IndexedDbSaveStore, MemorySaveStore, TauriSaveStore } from './saveStore';
export type { SaveStore } from './saveStore';
