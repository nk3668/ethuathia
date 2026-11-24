import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Bar, Button, Card, Panel, Tabs, Tooltip } from '../kit';
import styles from './KitGallery.module.css';

/**
 * Dev-only page showing every kit component in every state, plus the tokens they are built
 * from. Open it with `?kit` on the dev server URL (see main.tsx); production builds leave it out.
 */
export function KitGallery() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.heading}>Kit gallery</h1>
        <p className={styles.muted}>
          Every kit component and state. Tab through the page to check focus outlines and tooltips.
        </p>
      </header>
      <ColorTokens />
      <TypeSamples />
      <ButtonSamples />
      <PanelAndCardSamples />
      <TabSamples />
      <TooltipSamples />
      <BarSamples />
    </main>
  );
}

const COLOR_GROUPS: { title: string; tokens: string[] }[] = [
  {
    title: 'Surfaces',
    tokens: ['--bg-app', '--bg-panel', '--bg-raised', '--bg-hover', '--border', '--border-strong'],
  },
  { title: 'Text', tokens: ['--text', '--text-muted', '--text-faint', '--accent', '--on-accent'] },
  {
    title: 'Meaning',
    tokens: ['--hp', '--mp', '--xp', '--renown', '--trophies', '--favor', '--good', '--warn', '--danger'],
  },
  { title: 'Log', tokens: ['--log-combat', '--log-loot', '--log-discovery', '--log-ai', '--log-system'] },
];

function ColorTokens() {
  return (
    <Panel title="Color tokens">
      {COLOR_GROUPS.map((group) => (
        <div key={group.title}>
          <h3 className={styles.label}>{group.title}</h3>
          <ul className={styles.swatches}>
            {group.tokens.map((token) => (
              <li key={token} className={styles.swatch}>
                <span className={styles.chip} style={{ '--swatch': `var(${token})` } as CSSProperties} />
                <code className={styles.mono}>{token}</code>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Panel>
  );
}

const LOG_SAMPLES = [
  { category: 'combat', prefix: '⚔', text: 'Mira hits the goblin for 7' },
  { category: 'loot', prefix: '◆', text: 'Mira picks up 12 coins' },
  { category: 'discovery', prefix: '✦', text: 'Oren finds a fountain' },
  { category: 'ai', prefix: '➤', text: 'Mira quaffs a healing potion (rule #1: HP 24% < 30%)' },
  { category: 'system', prefix: '·', text: 'Floor 7 reached' },
] as const;

function TypeSamples() {
  return (
    <Panel title="Type">
      <p className={styles.sample}>UI text: Inter 13 / 18. The party descends into the dark.</p>
      <p className={styles.label}>Small label: Inter 11 / 14, uppercase</p>
      <p className={styles.headingSample}>Heading: Inter 600, 15 / 20</p>
      <p className={styles.numbers}>
        Tabular numbers: 1,111 · 8,888 · 12.4k
        <br />
        Tabular numbers: 4,812 · 1,050 · 3.1k
      </p>
      <div className={styles.log}>
        {LOG_SAMPLES.map((line) => (
          <div key={line.category} className={styles[line.category]}>
            <span aria-hidden="true">{line.prefix}</span> {line.text}
          </div>
        ))}
      </div>
    </Panel>
  );
}

const SPEEDS = ['1×', '2×', '4×', '8×'] as const;

function ButtonSamples() {
  const [speed, setSpeed] = useState<string>('1×');
  return (
    <Panel title="Button">
      <div className={styles.row}>
        <Button variant="primary">Descend</Button>
        <Button>Save as…</Button>
        <Button variant="ghost">Cancel</Button>
      </div>
      <div className={styles.row}>
        <Button variant="primary" disabled>
          Descend
        </Button>
        <Button disabled>Save as…</Button>
        <Button variant="ghost" disabled>
          Cancel
        </Button>
      </div>
      <div className={styles.row}>
        <Button disabledReason="Respec is between runs, not during one.">Reset tree</Button>
      </div>
      <div className={styles.row} role="group" aria-label="Speed">
        {SPEEDS.map((step) => (
          <Button key={step} pressed={speed === step} onClick={() => setSpeed(step)}>
            {step}
          </Button>
        ))}
      </div>
    </Panel>
  );
}

function PanelAndCardSamples() {
  return (
    <div className={styles.columns}>
      <Panel title="Panel with actions" actions={<Button variant="ghost">Collapse</Button>}>
        <Card>
          <strong>Mira</strong>
          <span className={styles.muted}>Human Vanguard · default card</span>
        </Card>
        <Card selected>
          <strong>Oren</strong>
          <span className={styles.muted}>Elf Ranger · selected card</span>
        </Card>
      </Panel>
      <Panel aria-label="Panel without a title">
        <p className={styles.sample}>A panel without a title has only a body.</p>
      </Panel>
    </div>
  );
}

function TabSamples() {
  return (
    <Panel title="Tabs">
      <Tabs
        label="Side panel"
        items={[
          { id: 'rules', label: 'Rules', content: <p className={styles.sample}>The rules editor goes here.</p> },
          { id: 'town', label: 'Town', content: <p className={styles.sample}>Town buildings go here.</p> },
          { id: 'codex', label: 'Codex', content: <p className={styles.sample}>Codex entries go here.</p> },
          { id: 'graveyard', label: 'Graveyard', content: null, disabled: true },
        ]}
      />
    </Panel>
  );
}

function TooltipSamples() {
  return (
    <Panel title="Tooltip">
      <div className={styles.row}>
        <Tooltip content="Pause the run (Space)">
          <Button>Pause</Button>
        </Tooltip>
        <Tooltip content="Renown: earned from depth reached and turns survived." placement="bottom">
          12.4k Renown
        </Tooltip>
      </div>
    </Panel>
  );
}

function BarSamples() {
  return (
    <Panel title="Bar">
      <div className={styles.bars}>
        <Bar label="HP" tone="hp" value={58} max={58} ariaLabel="Full HP" />
        <Bar label="HP" tone="hp" value={41} max={58} />
        <Bar label="HP" tone="hp" value={0} max={58} ariaLabel="Empty HP" />
        <Bar label="MP" tone="mp" value={12} max={40} />
        <Bar label="XP" tone="xp" value={340} max={500} />
        <Bar label="Map" value={3} max={4} showValue={false} ariaLabel="Floor explored" />
      </div>
    </Panel>
  );
}
