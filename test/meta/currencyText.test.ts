import { describe, expect, it } from 'vitest';
import { GOLD_PER_TROPHY, VALUE_PER_TROPHY } from '../../src/content';
import { CURRENCY_INFO, goldConversionText, itemSaleText, TROPHIES_KILLS_TEXT, TROPHIES_OMEN_TEXT } from '../../src/meta';

describe('Trophies text (ETH-183)', () => {
  it('the one explanation is built from the shared pieces', () => {
    const { about } = CURRENCY_INFO.trophies;
    expect(about).toContain(TROPHIES_KILLS_TEXT);
    expect(about).toContain(goldConversionText(GOLD_PER_TROPHY));
    expect(about).toContain(itemSaleText(VALUE_PER_TROPHY));
    expect(about).toContain(TROPHIES_OMEN_TEXT);
    expect(about).toContain('Smithy');
  });

  it('the pieces carry the rates they are given', () => {
    expect(goldConversionText(7)).toContain('7 gold = 1 Trophy');
    expect(itemSaleText(3)).toContain('3 value = 1 Trophy');
  });
});
