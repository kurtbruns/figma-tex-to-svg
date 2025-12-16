/**
 * Unified render options collection and application
 */

import { RenderOptions, UserPreferences } from './types';
import { SubExpressionStylesManager } from './subExpressionStyles';
import { expandColor, THEME_DEFAULTS } from './utils';

/**
 * Collect all render options from the UI DOM
 */
export function collectRenderOptionsFromUI(
  subExpressionManager: SubExpressionStylesManager,
  currentTheme: string = 'dark'
): RenderOptions {
  // Get TeX input
  const tex = (document.getElementById('input') as HTMLTextAreaElement)?.value.trim() || '';

  // Get display style
  const display = (document.getElementById('display') as HTMLInputElement)?.checked ?? true;

  // Get font size
  const fontsizeInput = (document.getElementById('fontsize') as HTMLInputElement)?.value;
  const fontSize = fontsizeInput ? parseFloat(fontsizeInput) : 24;

  // Get background color
  const bgcolorRaw = (document.getElementById('bgcolor') as HTMLInputElement)?.value.trim() ||
    THEME_DEFAULTS[currentTheme]?.background ||
    THEME_DEFAULTS.dark.background;
  const backgroundColor = '#' + expandColor(bgcolorRaw);

  // Get font color
  const fontcolorRaw = (document.getElementById('fontcolor') as HTMLInputElement)?.value.trim() ||
    THEME_DEFAULTS[currentTheme]?.font ||
    THEME_DEFAULTS.dark.font;
  const fontColor = '#' + expandColor(fontcolorRaw);

  // Get sub-expression styles from manager
  const subExpressionStyles = subExpressionManager.getAll();

  return {
    tex,
    display,
    fontSize,
    backgroundColor,
    fontColor,
    subExpressionStyles,
  };
}

/**
 * Apply render options to the UI DOM
 */
export function applyRenderOptionsToUI(
  options: RenderOptions | UserPreferences,
  subExpressionManager: SubExpressionStylesManager,
  currentTheme: string = 'dark'
): void {
  // Set TeX input
  const texInput = document.getElementById('input') as HTMLTextAreaElement;
  if (texInput) {
    texInput.value = options.tex;
  }

  // Set display style
  const displayInput = document.getElementById('display') as HTMLInputElement;
  if (displayInput) {
    displayInput.checked = options.display;
  }

  // Set font size
  const fontSizeInput = document.getElementById('fontsize') as HTMLInputElement;
  if (fontSizeInput) {
    fontSizeInput.value = options.fontSize.toString();
  }

  // Set background color (strip # prefix for text input)
  const bgcolorRaw = options.backgroundColor.replace(/^#/, '');
  const bgcolorExpanded = expandColor(bgcolorRaw);
  const bgcolorInput = document.getElementById('bgcolor') as HTMLInputElement;
  const bgcolorPicker = document.getElementById('bgcolor-picker') as HTMLInputElement;
  if (bgcolorInput) {
    bgcolorInput.value = bgcolorExpanded;
  }
  if (bgcolorPicker) {
    bgcolorPicker.value = options.backgroundColor;
  }

  // Set font color (strip # prefix for text input)
  const fontcolorRaw = options.fontColor.replace(/^#/, '');
  const fontcolorExpanded = expandColor(fontcolorRaw);
  const fontcolorInput = document.getElementById('fontcolor') as HTMLInputElement;
  const fontcolorPicker = document.getElementById('fontcolor-picker') as HTMLInputElement;
  if (fontcolorInput) {
    fontcolorInput.value = fontcolorExpanded;
  }
  if (fontcolorPicker) {
    fontcolorPicker.value = options.fontColor;
  }

  // Set sub-expression styles in manager
  subExpressionManager.clear();
  options.subExpressionStyles.forEach(style => {
    subExpressionManager.add(style);
  });
}

