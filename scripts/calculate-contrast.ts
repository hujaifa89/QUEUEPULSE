/**
 * WCAG 2.1 AA Contrast Ratio Calculator (Phase 9 & Section 13)
 * Calculates relative luminance and contrast ratio for QueuePulse color palette pairs.
 * Formula per W3C WCAG 2.1 specifications: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const bigint = parseInt(cleanHex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export function contrastRatio(hex1: string, hex2: string): number {
  const lum1 = relativeLuminance(hex1);
  const lum2 = relativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export interface PalettePair {
  name: string;
  foreground: string;
  background: string;
  expectedMinRatio: number;
}

export const PALETTE_PAIRS: PalettePair[] = [
  {
    name: 'Primary Button: White text on Teal-700 background',
    foreground: '#FFFFFF',
    background: '#0F766E',
    expectedMinRatio: 4.5, // Target: AA normal text
  },
  {
    name: 'Primary Text on White page background',
    foreground: '#0F172A',
    background: '#FFFFFF',
    expectedMinRatio: 4.5,
  },
  {
    name: 'Primary Text on Slate-50 background',
    foreground: '#0F172A',
    background: '#F8FAFC',
    expectedMinRatio: 4.5,
  },
  {
    name: 'Secondary/Muted Slate-600 text on White background',
    foreground: '#475569',
    background: '#FFFFFF',
    expectedMinRatio: 4.5,
  },
  {
    name: 'Teal Brand (#0F766E) text on White background',
    foreground: '#0F766E',
    background: '#FFFFFF',
    expectedMinRatio: 4.5,
  },
  {
    name: 'Warning (#B45309) text on Amber-50 (#FFFBEB) alert banner',
    foreground: '#B45309',
    background: '#FFFBEB',
    expectedMinRatio: 4.5,
  },
  {
    name: 'Danger (#B91C1C) text on Red-50 (#FEF2F2) alert banner',
    foreground: '#B91C1C',
    background: '#FEF2F2',
    expectedMinRatio: 4.5,
  },
  {
    name: 'Success (#15803D) text on Emerald-50 (#F0FDF4) badge/banner',
    foreground: '#15803D',
    background: '#F0FDF4',
    expectedMinRatio: 4.5,
  },
  {
    name: 'Serving Big Number (#0F172A) on White card',
    foreground: '#0F172A',
    background: '#FFFFFF',
    expectedMinRatio: 3.0, // Target: AA large text
  },
];

export function evaluatePaletteContrast() {
  console.log('=== QueuePulse WCAG 2.1 AA Palette Contrast Audit ===\n');
  const results = PALETTE_PAIRS.map((pair) => {
    const ratio = contrastRatio(pair.foreground, pair.background);
    const passes = ratio >= pair.expectedMinRatio;
    return {
      name: pair.name,
      foreground: pair.foreground,
      background: pair.background,
      ratio: `${ratio}:1`,
      required: `>= ${pair.expectedMinRatio}:1`,
      status: passes ? 'PASS (AA)' : 'FAIL',
    };
  });

  return results;
}

if (require.main === module) {
  const table = evaluatePaletteContrast();
  console.table(table);
}
