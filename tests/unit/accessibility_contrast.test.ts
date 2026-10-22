import { contrastRatio, PALETTE_PAIRS } from '@/../scripts/calculate-contrast';

describe('WCAG 2.1 AA Color Contrast Audit (Phase 9, Section 13)', () => {
  PALETTE_PAIRS.forEach((pair) => {
    it(`evaluates ${pair.name} - expected >= ${pair.expectedMinRatio}:1`, () => {
      const ratio = contrastRatio(pair.foreground, pair.background);
      expect(ratio).toBeGreaterThanOrEqual(pair.expectedMinRatio);
    });
  });

  it('guarantees Primary Button (White on #0F766E) has at least 4.5:1 contrast', () => {
    const ratio = contrastRatio('#FFFFFF', '#0F766E');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('guarantees Primary Text (#0F172A on White) has high accessibility contrast (>10:1)', () => {
    const ratio = contrastRatio('#0F172A', '#FFFFFF');
    expect(ratio).toBeGreaterThanOrEqual(10.0);
  });
});
