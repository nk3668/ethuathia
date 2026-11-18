/** Every Prepare panel, collected from `panels/*.ts` (each file's default export). */
import type { PreparePanelDef } from './types';

/** Vite resolves the glob at build time; nothing loads at run time. */
const MODULES = import.meta.glob<{ default: PreparePanelDef }>('./panels/*.ts', { eager: true });

/** The panels in `modules`, sorted by `order`. Throws on a file without one or a repeated id. */
export function collectPanels(modules: Readonly<Record<string, { default?: PreparePanelDef }>>): PreparePanelDef[] {
  const panels: PreparePanelDef[] = [];
  const ids = new Set<string>();
  for (const [path, module] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))) {
    const panel = module.default;
    if (panel === undefined) throw new Error(`Prepare panel file ${path} has no default export`);
    if (ids.has(panel.id)) throw new Error(`Two Prepare panels with the id "${panel.id}" (again in ${path})`);
    ids.add(panel.id);
    panels.push(panel);
  }
  return panels.sort((a, b) => a.order - b.order);
}

export const PREPARE_PANELS: readonly PreparePanelDef[] = collectPanels(MODULES);
