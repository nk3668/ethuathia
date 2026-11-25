/** Codex view of Omens (ETH-185): one row per rank with what it does and the reward it pays. */
import { OMENS, rankNumeral } from '../../../content';
import type { OmenDef } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer<OmenDef>({
  registry: OMENS,
  label: 'Omens',
  order: 50,
  hint: 'Unlock it in the town to read about it.',
  fields: (def) => [
    {
      label: 'Opt-in',
      value: 'Off until you pick a rank on the Prepare screen',
      hint: 'An Omen never turns on by itself. The reward multiplier is the only thing it pays.',
      key: true,
    },
    ...def.ranks.map((rank, i) => ({
      label: `Rank ${rankNumeral(i + 1)}`,
      value: `${rank.text} Rewards +${Math.round(rank.reward * 100)}%.`,
      hint: `The reward multiplier is 1 plus the bonus of every Omen on; rank ${rankNumeral(i + 1)} brings its total to +${Math.round(rank.reward * 100)}%.`,
      key: i === 0,
    })),
  ],
});
