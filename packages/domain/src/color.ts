// Hub brand colours are used for buttons with white text, so they must reach WCAG AA (4.5:1).
export const TALENTRAL_BLUE = '#2E5BFF';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// The colour to use for primary buttons: the hub colour when it is readable on white text, otherwise Talentral Blue.
export function buttonColor(brand: string | null | undefined): string {
  if (brand && isHexColor(brand) && contrastRatio(brand.toUpperCase(), '#FFFFFF') >= 4.5) return brand.toUpperCase();
  return TALENTRAL_BLUE;
}
