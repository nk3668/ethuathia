// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostMessage, HostRequest, Unsubscribe } from '../../src/sim';
import { WorkerHost } from '../../src/ui/host/workerHost';
import type { WorkerPort } from '../../src/ui/host/workerHost';
import { AppShell } from '../../src/ui/shell/AppShell';
import { STOPPED_HINT } from '../../src/ui/shell/SpeedControls';
import { bindHost, DEFAULT_SPEED, useSimStore } from '../../src/ui/stores/simStore';
import { LOG_HEIGHT, useUiStore } from '../../src/ui/stores/uiStore';

// jsdom has no 2D canvas; the map then draws nothing.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

/** A stand-in worker: records what the host posts and lets the test post messages back. */
class FakeWorker implements WorkerPort {
  readonly posted: HostRequest[] = [];
  private listener: ((event: MessageEvent<HostMessage>) => void) | null = null;

  postMessage(message: HostRequest): void {
    this.posted.push(message);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<HostMessage>) => void): void {
    this.listener = listener;
  }

  reply(message: HostMessage): void {
    this.listener?.({ data: message } as MessageEvent<HostMessage>);
  }

  speedsSent(): unknown[] {
    return this.posted.flatMap((r) => (r.type === 'setSpeed' ? [r.speed] : []));
  }
}

let worker: FakeWorker;
let host: WorkerHost;
let unbind: Unsubscribe;

beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList;
  useSimStore.getState().reset();
  useSimStore.setState({ speed: DEFAULT_SPEED, resumeSpeed: DEFAULT_SPEED });
  useUiStore.setState({ logHeight: LOG_HEIGHT.default, tab: 'rules', selected: null, drawerOpen: false });
  worker = new FakeWorker();
  host = new WorkerHost(worker);
  unbind = bindHost(host);
});
afterEach(() => {
  cleanup();
  unbind();
  host.dispose();
  localStorage.clear();
  delete (window as Partial<Window>).matchMedia;
});

const speedGroup = () => within(screen.getByRole('group', { name: 'Sim speed' }));

describe('sim error', () => {
  it('shows the error in a banner, shows paused, and refuses to resume with a tooltip saying why', async () => {
    const user = userEvent.setup();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppShell />);
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(speedGroup().getByRole('button', { name: '4×' }));
    expect(worker.speedsSent()).toEqual([4]);

    act(() => worker.reply({ type: 'error', message: 'Actor 3 has no position' }));

    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('The run stopped on an error');
    expect(banner.textContent).toContain('Actor 3 has no position');
    expect(banner.textContent).toContain('can’t be resumed');
    const pause = speedGroup().getByRole('button', { name: 'Pause' });
    expect(pause.getAttribute('aria-pressed')).toBe('true');
    for (const button of speedGroup().getAllByRole('button')) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
    }

    // Neither the buttons nor the keys resume it, and nothing more is sent to the worker.
    await user.click(pause);
    await user.click(speedGroup().getByRole('button', { name: '2×' }));
    await user.keyboard(' 3');
    expect(useSimStore.getState().speed).toBe(0);
    expect(worker.speedsSent()).toEqual([4]);

    // The tooltip explains, and no longer offers a key.
    pause.focus();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain(STOPPED_HINT);
    expect(tooltip.textContent).not.toMatch(/Key:/);
    expect(logged).toHaveBeenCalledWith('Sim worker: Actor 3 has no position');
    logged.mockRestore();
  });

  it('clears the banner and allows resuming when a new run resets the store', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppShell />);
    act(() => worker.reply({ type: 'error', message: 'boom' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    act(() => useSimStore.getState().reset());
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(speedGroup().getByRole('button', { name: '8×' }));
    expect(worker.speedsSent()).toEqual([8]);
    expect(speedGroup().getByRole('button', { name: '8×' }).getAttribute('aria-disabled')).toBeNull();
    vi.restoreAllMocks();
  });
});
