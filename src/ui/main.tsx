import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { validateGame } from '../sim';
import { App } from './App';
import './fonts.css';
import './tokens.css';
import './base.css';

// Content is checked once at start-up (docs/ARCHITECTURE.md §5): a bad definition stops the game
// here with a list of every problem, rather than failing somewhere in the middle of a run.
validateGame();

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing the #root element');

/**
 * Picks the page to show. In dev mode, `?kit` opens the kit gallery. `import.meta.env.DEV` is a
 * build-time constant, so production builds drop this branch and the gallery chunk with it.
 */
async function pickPage(): Promise<ReactNode> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('kit')) {
    const { KitGallery } = await import('./dev/KitGallery');
    return <KitGallery />;
  }
  return <App />;
}

void pickPage().then((page) => {
  createRoot(root).render(<StrictMode>{page}</StrictMode>);
});
