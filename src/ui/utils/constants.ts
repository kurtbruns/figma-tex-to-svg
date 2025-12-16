/**
 * Shared constants
 */

/**
 * Theme defaults (without # prefix)
 */
export const THEME_DEFAULTS: Record<string, { background: string; font: string }> = {
  window: {
    background: '38464F',
    font: 'E0E0E0',
  },
  dark: {
    background: '000000',
    font: 'E0E0E0',
  },
  light: {
    background: 'FFFFFF',
    font: '333333',
  },
};

/**
 * Light theme colors for sub-expression styles (without # prefix)
 */
export const LIGHT_THEME_COLORS: string[] = [
  'DC3412', // red
  '009951', // green
  '007bE5', // blue
  '8638E5', // purple
  'FFC21A', // yellow
];

/**
 * Dark theme colors for sub-expression styles (without # prefix)
 */
export const DARK_THEME_COLORS: string[] = [
  'FF8A80', // red
  '79D297', // green
  '7CC4F8', // blue
  'D6B6FB', // purple
  'F7D15F', // yellow
];

/**
 * Get the next color for a sub-expression style based on theme and current count
 * @param theme - The current theme ('light' or 'dark')
 * @param currentCount - The current number of styles (0-based)
 * @returns A color hex string with # prefix
 */
export function getNextSubExpressionColor(theme: string, currentCount: number): string {
  const colors = theme === 'light' ? LIGHT_THEME_COLORS : DARK_THEME_COLORS;
  const colorIndex = currentCount % colors.length;
  return '#' + colors[colorIndex];
}

