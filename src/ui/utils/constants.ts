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
    font: '222222',
  },
};

/**
 * Light theme colors for sub-expression styles (without # prefix)
 */
export const LIGHT_THEME_COLORS: string[] = [
  'dc3412', // red
  '009951', // green
  '007be5', // blue
  '8638e5', // purple
  'ffc21a', // yellow
];

/**
 * Dark theme colors for sub-expression styles (without # prefix)
 */
export const DARK_THEME_COLORS: string[] = [
  'fbbcb6', // red
  '79d297', // green
  '7cc4f8', // blue
  'd6b6fb', // purple
  'f7d15f', // yellow
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

