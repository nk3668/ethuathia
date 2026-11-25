/**
 * Town pacing (ETH-161, `npm run sim -- --pacing`): turns a report's mean banked Renown and
 * Trophies per run into how many runs of that income each town node takes. A rough model: income
 * is held flat at the measured rate (sweep a fresh and a progressed profile to bracket it), every
 * rank of every node is bought in the cheapest-first order, a pick-one group buys only its cheapest
 * member, and tier quests and reveal milestones are assumed met when their band is reached.
 */
import { BUILDINGS, rankPrice, tierBand, UPGRADES } from '../../src/content';
import type { UpgradeNodeDef } from '../../src/content';

export interface PacingIncome {
  renown: number;
  trophies: number;
}

interface Step {
  node: UpgradeNodeDef;
  rank: number;
  currency: 'renown' | 'trophies';
  price: number;
  band: number;
}

function stepsOf(buildingId: string): Step[] {
  const building = BUILDINGS.get(buildingId);
  const nodes = UPGRADES.all().filter((n) => n.building === buildingId);
  const cheapestInGroup = new Map<string, UpgradeNodeDef>();
  for (const n of nodes) {
    if (n.exclusiveGroup === undefined) continue;
    const held = cheapestInGroup.get(n.exclusiveGroup);
    if (held === undefined || total(n, 1) < total(held, 1)) cheapestInGroup.set(n.exclusiveGroup, n);
  }
  const steps: Step[] = [];
  for (const node of nodes) {
    if (node.exclusiveGroup !== undefined && cheapestInGroup.get(node.exclusiveGroup) !== node) continue;
    for (let rank = 1; rank <= (node.ranks?.max ?? 1); rank++) {
      const price = rankPrice(node, rank);
      const currency = price.trophies !== undefined ? 'trophies' : 'renown';
      steps.push({ node, rank, currency, price: price[currency] ?? 0, band: tierBand(building, node.tier) });
    }
  }
  return steps.sort((a, b) => a.band - b.band || a.price - b.price);
}

function total(node: UpgradeNodeDef, rank: number): number {
  return Object.values(rankPrice(node, rank)).reduce((a, b) => a + b, 0);
}

/** Runs (at `income` per run) to afford each node rank of every building, bought cheapest-first per band. */
export function formatPacing(income: PacingIncome): string {
  const lines = [
    `Town pacing at ${income.renown.toFixed(0)} Renown and ${income.trophies.toFixed(0)} Trophies a run ` +
      '(cumulative, cheapest first within each tier band; a pick-one group counts its cheapest node):',
  ];
  for (const building of BUILDINGS.all()) {
    const steps = stepsOf(building.id);
    if (steps.length === 0) continue;
    lines.push('', `${building.name}:`);
    const spent = { renown: 0, trophies: 0 };
    let band = 0;
    for (const s of steps) {
      if (s.band !== band) {
        if (band !== 0) lines.push(`  -- band ${band} done after ${runs(spent, income)} runs`);
        band = s.band;
      }
      spent[s.currency] += s.price;
      const own = income[s.currency] > 0 ? s.price / income[s.currency] : Infinity;
      const name = `${s.node.name}${(s.node.ranks?.max ?? 1) > 1 ? ` ${s.rank}` : ''}`;
      lines.push(
        `  ${name.padEnd(28)} ${String(s.price).padStart(5)} ${s.currency.padEnd(8)} ` +
          `alone ${own.toFixed(1).padStart(5)} runs, cumulative ${runs(spent, income).padStart(5)} runs` +
          (s.node.reveal === undefined ? '' : ' (revealed by a milestone)'),
      );
    }
    lines.push(`  -- band ${band} done after ${runs(spent, income)} runs`);
  }
  return lines.join('\n');
}

/** Runs to earn `spent` of both currencies at once (they accrue together, so the slower one sets the pace). */
function runs(spent: PacingIncome, income: PacingIncome): string {
  const need = Math.max(
    income.renown > 0 ? spent.renown / income.renown : spent.renown > 0 ? Infinity : 0,
    income.trophies > 0 ? spent.trophies / income.trophies : spent.trophies > 0 ? Infinity : 0,
  );
  return need.toFixed(1);
}
