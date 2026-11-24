// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bar, Button, Card, Panel, Tabs, Tooltip } from '../../src/ui/kit';
import { KitGallery } from '../../src/ui/dev/KitGallery';

afterEach(cleanup);

describe('Button', () => {
  it('is a plain button that clicks with Enter and Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Pause</Button>);
    const button = screen.getByRole('button', { name: 'Pause' });
    expect(button).toHaveProperty('type', 'button');
    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('marks a pressed toggle with aria-pressed', () => {
    render(
      <>
        <Button pressed>1×</Button>
        <Button pressed={false}>2×</Button>
        <Button>Plain</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: '1×' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '2×' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Plain' }).hasAttribute('aria-pressed')).toBe(false);
  });

  it('is skipped by Tab when disabled', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button disabled>Off</Button>
        <Button>On</Button>
      </>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'On' }));
  });

  it('shows a tooltip on focus (dismissed by Escape) and hover when disabledReason is set', async () => {
    const user = userEvent.setup();
    render(
      <Button disabledReason="Needs 40 Renown more.">
        Buy
      </Button>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.tab();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Needs 40 Renown more.');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.hover(screen.getByRole('button', { name: 'Buy' }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('Needs 40 Renown more.');
    await user.unhover(screen.getByRole('button', { name: 'Buy' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays natively disabled, refuses activation, keeps clean name, and links aria-describedby', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <p id="extra-help">Extra detail</p>
        <Button disabledReason="Respec is between runs, not during one." aria-describedby="extra-help" onClick={onClick}>
          Reset tree
        </Button>
      </>,
    );

    const button = screen.getByRole('button', { name: 'Reset tree' });
    expect(button).toHaveProperty('disabled', true);

    const describedBy = button.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(/\s+/).filter(Boolean);
    expect(ids).toContain('extra-help');
    const descriptionText = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(descriptionText).toContain('Respec is between runs, not during one.');

    await user.click(button);
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ''])('behaves as an enabled plain button when disabledReason is %j', async (emptyReason) => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(
      <Button ref={ref} disabledReason={emptyReason} onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(ref.current).toBe(button);
    expect(button).toHaveProperty('disabled', false);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    expect(container.firstElementChild).toBe(button);

    await user.tab();
    expect(document.activeElement).toBe(button);
    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Panel', () => {
  it('is a region named by its title, with actions', () => {
    render(
      <Panel title="Party" actions={<Button>Collapse</Button>}>
        body
      </Panel>,
    );
    const region = screen.getByRole('region', { name: 'Party' });
    expect(screen.getByRole('heading', { name: 'Party' })).toBeTruthy();
    expect(region.textContent).toContain('body');
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
  });

  it('renders without a header when it has no title or actions', () => {
    const { container } = render(<Panel>just a body</Panel>);
    expect(container.querySelector('header')).toBeNull();
  });
});

describe('Card', () => {
  it('marks the selected card', () => {
    render(
      <>
        <Card>Mira</Card>
        <Card selected>Oren</Card>
      </>,
    );
    expect(screen.getByText('Oren').hasAttribute('data-selected')).toBe(true);
    expect(screen.getByText('Mira').hasAttribute('data-selected')).toBe(false);
  });
});

describe('Bar', () => {
  it('is a named meter with its value as text', () => {
    render(<Bar label="HP" tone="hp" value={41} max={58} />);
    const meter = screen.getByRole('meter', { name: 'HP' });
    expect(meter.getAttribute('aria-valuenow')).toBe('41');
    expect(meter.getAttribute('aria-valuemax')).toBe('58');
    expect(meter.getAttribute('aria-valuetext')).toBe('41 of 58');
    expect(meter.textContent).toContain('41 / 58');
  });

  it('clamps out-of-range values and copes with a zero max', () => {
    render(
      <>
        <Bar label="HP" ariaLabel="over" value={70} max={58} />
        <Bar label="HP" ariaLabel="under" value={-3} max={58} />
        <Bar label="MP" ariaLabel="none" value={5} max={0} />
      </>,
    );
    expect(screen.getByRole('meter', { name: 'over' }).getAttribute('aria-valuenow')).toBe('58');
    expect(screen.getByRole('meter', { name: 'under' }).getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByRole('meter', { name: 'none' }).getAttribute('aria-valuenow')).toBe('0');
  });
});

const TAB_ITEMS = [
  { id: 'rules', label: 'Rules', content: 'Rules panel' },
  { id: 'town', label: 'Town', content: 'Town panel' },
  { id: 'locked', label: 'Locked', content: 'never', disabled: true },
  { id: 'codex', label: 'Codex', content: 'Codex panel' },
];

describe('Tabs', () => {
  it('shows the first tab and its panel, with one tab stop', () => {
    render(<Tabs label="Side panel" items={TAB_ITEMS} />);
    expect(screen.getByRole('tablist', { name: 'Side panel' })).toBeTruthy();
    const rules = screen.getByRole('tab', { name: 'Rules' });
    expect(rules.getAttribute('aria-selected')).toBe('true');
    expect(rules.tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: 'Town' }).tabIndex).toBe(-1);
    expect(screen.getByRole('tabpanel', { name: 'Rules' }).textContent).toBe('Rules panel');
  });

  it('moves and selects with the arrow keys, Home and End, skipping disabled tabs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs label="Side panel" items={TAB_ITEMS} onChange={onChange} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Rules' }));

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Town' }));
    expect(screen.getByRole('tabpanel').textContent).toBe('Town panel');

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Codex' }));

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Rules' }));

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Codex' }));

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Rules' }));

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Codex' }).getAttribute('aria-selected')).toBe('true');
    expect(onChange.mock.calls.map(([id]) => id)).toEqual(['town', 'codex', 'rules', 'codex', 'rules', 'codex']);
  });

  it('Tab moves from the selected tab into its panel', async () => {
    const user = userEvent.setup();
    render(<Tabs label="Side panel" items={TAB_ITEMS} />);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tabpanel'));
  });

  it('can be controlled', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [tab, setTab] = useState('town');
      return (
        <>
          <Tabs label="Side panel" items={TAB_ITEMS} value={tab} onChange={setTab} />
          <output>{tab}</output>
        </>
      );
    }
    render(<Controlled />);
    expect(screen.getByRole('tabpanel').textContent).toBe('Town panel');
    await user.click(screen.getByRole('tab', { name: 'Codex' }));
    expect(screen.getByRole('status').textContent).toBe('codex');
    expect(screen.getByRole('tabpanel').textContent).toBe('Codex panel');
  });
});

describe('Tooltip', () => {
  it('opens on keyboard focus and describes its trigger', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Pause the run (Space)">
        <Button>Pause</Button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.tab();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Pause the run (Space)');
    const button = screen.getByRole('button', { name: 'Pause' });
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on hover and closes when the pointer leaves', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Renown earned so far">
        <Button>12.4k</Button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button'));
    expect((await screen.findByRole('tooltip')).textContent).toBe('Renown earned so far');
    await user.unhover(screen.getByRole('button'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps the trigger’s own handlers and ref', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Tooltip content="tip">
        <Button ref={ref} onClick={onClick}>
          Go
        </Button>
      </Tooltip>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(ref.current).toBe(button);
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('wraps plain text in a focusable trigger', async () => {
    const user = userEvent.setup();
    render(<Tooltip content="Trophies come from kills">3.1k Trophies</Tooltip>);
    await user.tab();
    expect(document.activeElement?.textContent).toBe('3.1k Trophies');
    expect((await screen.findByRole('tooltip')).textContent).toBe('Trophies come from kills');
  });
});

describe('KitGallery', () => {
  it('renders every kit component', () => {
    render(<KitGallery />);
    for (const name of ['Color tokens', 'Type', 'Button', 'Panel with actions', 'Tabs', 'Tooltip', 'Bar']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.getAllByRole('meter').length).toBeGreaterThan(3);
    expect(screen.getByRole('tablist')).toBeTruthy();
  });
});
