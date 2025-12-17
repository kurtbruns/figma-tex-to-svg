/**
 * Shared constants
 */

/**
 * Default MathJax font size (in pixels) used for scale calculations
 */
export const MATHJAX_DEFAULT_FONT_SIZE = 13.5;

/**
 * Default render options (dark theme defaults)
 * These are used throughout the application when loading node data or preferences
 */
export const DEFAULT_RENDER_OPTIONS = {
  fontSize: 24,
  backgroundColor: '#000000',
  fontColor: '#EEEEEE',
  display: true,
} as const;

/**
 * Theme defaults (without # prefix)
 */
export const THEME_DEFAULTS: Record<string, { background: string; font: string }> = {
  window: {
    background: '38464F',
    font: 'EEEEEE',
  },
  dark: {
    background: '000000',
    font: 'EEEEEE',
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

