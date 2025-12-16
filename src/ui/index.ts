// Entry point for the UI when served via webpack-dev-server.
// This file contains the logic originally in ui.html's inline <script> block.

import './styles/main.css';
import { typesetMath, TypesettingOptions, SubExpressionErrorCallbacks, setSVGColor, applySubExpressionColors } from './mathRenderer';
import { SubExpressionStylesManager } from './subExpressionStyles';
import { SubExpressionStylesUI } from './subExpressionStylesUI';
import { collectRenderOptionsFromUI, applyRenderOptionsToUI } from './renderOptions';
import { RenderOptions, UserPreferences, SubExpressionStyle } from './types';
import { expandColor, THEME_DEFAULTS } from './utils';

let currentTheme: string = 'dark'; // fallback

// Sub-expression styling manager and UI
const subExpressionManager = new SubExpressionStylesManager();
let subExpressionUI: SubExpressionStylesUI | null = null;

// Track render state for optimization
let lastRenderedTex: string | null = null;
let lastRenderedDisplay: boolean | null = null;
let currentSVGWrapper: HTMLElement | null = null;

function applyTheme(theme: string) {
  const defaults = (THEME_DEFAULTS as any)[theme] || THEME_DEFAULTS.dark;
  (document.getElementById('bgcolor') as HTMLInputElement).value = defaults.background;
  (document.getElementById('fontcolor') as HTMLInputElement).value = defaults.font;
  // Update color pickers to match (color inputs need # prefix)
  (document.getElementById('bgcolor-picker') as HTMLInputElement).value = '#' + defaults.background;
  (document.getElementById('fontcolor-picker') as HTMLInputElement).value = '#' + defaults.font;
  currentTheme = theme;
}

function saveUserPreferences() {
  // Sync UI state to manager before collecting
  subExpressionUI?.syncFromUI();
  
  const options = collectRenderOptionsFromUI(subExpressionManager, currentTheme);
  
  (window.parent as Window).postMessage({ 
    pluginMessage: { 
      type: 'saveUserPreferences',
      ...options
    } 
  }, '*');
}

// Error callbacks for sub-expression styling (delegated to UI component)
function showSubExpressionError(rowIndex: number, field: string, message: string) {
  // mathRenderer uses 'tex' field name, but UI component handles both 'tex' and 'expression'
  subExpressionUI?.showError(rowIndex, field, message);
}

function clearSubExpressionError(rowIndex: number, field: string) {
  // mathRenderer uses 'tex' field name, but UI component handles both 'tex' and 'expression'
  subExpressionUI?.clearError(rowIndex, field);
}

function clearSubExpressionErrors() {
  subExpressionUI?.clearAllErrors();
}

// Sub-expression row management functions removed - now handled by SubExpressionStylesUI component

/**
 * Gets the SVG element from the wrapper node
 */
function getSVGElement(wrapper: HTMLElement): HTMLElement | null {
  const svgElement = wrapper.querySelector('svg');
  return svgElement ? (svgElement as unknown as HTMLElement) : null;
}

/**
 * Updates font color on existing SVG without re-rendering
 */
function updateFontColor(color: string): void {
  if (!currentSVGWrapper) return;
  const svgElement = getSVGElement(currentSVGWrapper);
  if (svgElement) {
    setSVGColor(svgElement, color);
  }
}

/**
 * Updates font size on existing SVG without re-rendering
 */
function updateFontSize(fontSize: number): void {
  if (!currentSVGWrapper) return;
  currentSVGWrapper.setAttribute('font-size', fontSize + 'px');
}

/**
 * Updates background color on output container
 */
function updateBackgroundColor(color: string): void {
  const output = document.getElementById('output') as HTMLDivElement;
  if (output) {
    output.style.background = color;
  }
}

/**
 * Updates sub-expression styles on existing SVG without re-rendering
 */
function updateSubExpressionStyles(styles: SubExpressionStyle[]): void {
  if (!currentSVGWrapper) return;
  const svgElement = getSVGElement(currentSVGWrapper);
  if (svgElement) {
    const errorCallbacks: SubExpressionErrorCallbacks = {
      showError: showSubExpressionError,
      clearError: clearSubExpressionError,
      clearAllErrors: clearSubExpressionErrors
    };
    applySubExpressionColors(svgElement, styles, errorCallbacks);
  }
}

/**
 * Updates styling on existing SVG without re-rendering MathJax
 */
function updateStyling(): void {
  // Sync UI state to manager before collecting
  subExpressionUI?.syncFromUI();
  
  // Collect render options using unified function
  const options = collectRenderOptionsFromUI(subExpressionManager, currentTheme);
  
  // Update styling properties
  updateBackgroundColor(options.backgroundColor);
  updateFontColor(options.fontColor);
  updateFontSize(options.fontSize);
  updateSubExpressionStyles(options.subExpressionStyles);
  
  // Trigger real-time update if node is loaded and we're not just loading data
  if (!isLoadingNodeData) {
    debouncedUpdate();
  }
  
  // Save user preferences after update
  saveUserPreferences();
}

/**
 * Updates sub-expression styles directly from manager state (bypasses DOM sync)
 * Used for real-time color picker updates
 */
function updateSubExpressionStylesDirectly(): void {
  if (!currentSVGWrapper) return;
  
  // Get styles directly from manager (already up to date)
  const styles = subExpressionManager.getAll();
  
  // Update sub-expression styles
  updateSubExpressionStyles(styles);
  
  // Trigger real-time update if node is loaded and we're not just loading data
  if (!isLoadingNodeData) {
    debouncedUpdate();
  }
  
  // Save user preferences after update
  saveUserPreferences();
}

/**
 * Full MathJax re-render (only when TeX or display mode changes)
 */
function renderMath(): void {
  // Sync UI state to manager before collecting
  subExpressionUI?.syncFromUI();
  
  // Collect render options using unified function
  const options = collectRenderOptionsFromUI(subExpressionManager, currentTheme);
  
  // Disable the display button until MathJax is done
  const display = document.getElementById("display") as HTMLInputElement;
  display.disabled = true;
  
  // Clear the old output
  const output = document.getElementById('output') as HTMLDivElement;
  output.innerHTML = '';
  output.style.background = options.backgroundColor;
  currentSVGWrapper = null;
  
  // Create error callbacks for UI integration
  const errorCallbacks: SubExpressionErrorCallbacks = {
    showError: showSubExpressionError,
    clearError: clearSubExpressionError,
    clearAllErrors: clearSubExpressionErrors
  };
  
  // Prepare typesetting options
  const typesettingOptions: TypesettingOptions = {
    display: options.display,
    fontSize: options.fontSize,
    fontColor: options.fontColor,
    subExpressionStyles: options.subExpressionStyles,
    outputElement: output,
    subExpressionErrorCallbacks: errorCallbacks
  };
  
  // Use the high-level typesetting function
  typesetMath(options.tex, typesettingOptions)
    .then((node: HTMLElement) => {
      output.appendChild(node);
      currentSVGWrapper = node;
      
      // Update tracked state
      lastRenderedTex = options.tex;
      lastRenderedDisplay = options.display;
      
      // Trigger real-time update if node is loaded and we're not just loading data
      if (!isLoadingNodeData) {
        debouncedUpdate();
      }
    })
    .catch((err: Error) => {
      output.appendChild(document.createElement('pre')).appendChild(document.createTextNode(err.message));
      currentSVGWrapper = null;
      lastRenderedTex = null;
      lastRenderedDisplay = null;
    })
    .finally(() => {
      display.disabled = false;
    });
  
  // Save user preferences after conversion
  saveUserPreferences();
}

/**
 * Smart dispatcher that decides between full render or styling update
 */
function convert() {
  // Sync UI state to manager before collecting
  subExpressionUI?.syncFromUI();
  
  // Collect render options using unified function
  const options = collectRenderOptionsFromUI(subExpressionManager, currentTheme);
  
  // Check if we need a full re-render
  const texChanged = lastRenderedTex !== options.tex;
  const displayChanged = lastRenderedDisplay !== options.display;
  const needsRender = texChanged || displayChanged || !currentSVGWrapper;
  
  if (needsRender) {
    renderMath();
  } else {
    updateStyling();
  }
}

// Add input event listener for auto-render
(document.getElementById('input') as HTMLTextAreaElement).addEventListener('input', convert);

// Track if we have a node loaded that can be updated
let hasNodeLoaded = false;
let currentNodeId: string | null = null;

// Flag to prevent updates when loading node data
let isLoadingNodeData = false;

// Debounce timer for real-time updates
let updateTimer: ReturnType<typeof setTimeout> | null = null;

// Draft state to preserve unplaced work
let draftState: RenderOptions | null = null;

// Function to save current draft state
function saveDraftState() {
  subExpressionUI?.syncFromUI();
  draftState = collectRenderOptionsFromUI(subExpressionManager, currentTheme);
}

// Function to restore draft state
function restoreDraftState() {
  if (draftState) {
    applyRenderOptionsToUI(draftState, subExpressionManager, currentTheme);
    subExpressionUI?.syncToUI();
    convert();
    draftState = null; // Clear after restoring
  }
}

// Function to switch to edit mode
function switchToEditMode(nodeId: string) {
  // Save draft state before switching
  saveDraftState();
  
  hasNodeLoaded = true;
  currentNodeId = nodeId;
  
  // Show edit mode indicator
  const indicator = document.getElementById('edit-mode-indicator') as HTMLDivElement;
  indicator.classList.add('visible');
  
  // Preview is always visible now (collapsed by default)
  // No need to hide it
  
  // Hide insert button
  const placeButton = document.getElementById('place') as HTMLButtonElement;
  placeButton.classList.add('hidden');
}

// Function to switch to create mode
function switchToCreateMode() {
  hasNodeLoaded = false;
  currentNodeId = null;
  
  // Hide edit mode indicator
  const indicator = document.getElementById('edit-mode-indicator') as HTMLDivElement;
  indicator.classList.remove('visible');
  
  // Show preview expanded in create mode
  const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
  const previewOutput = document.getElementById('preview-output') as HTMLDivElement;
  previewContainer.classList.add('expanded');
  previewOutput.classList.remove('collapsed');
  
  // Show insert button
  const placeButton = document.getElementById('place') as HTMLButtonElement;
  placeButton.classList.remove('hidden');
  
  // Restore draft state if available
  restoreDraftState();
}

// Helper function to prepare data for sending to backend
// Handles all frontend concerns: color normalization, data extraction
function prepareMessageData(updateExisting = false) {
  const outputElement = document.getElementById('output');
  if (!outputElement || !outputElement.firstChild) {
    return null; // No SVG rendered yet
  }
  
  // MathJax wraps the SVG in a container (e.g., mjx-container)
  // Extract the actual SVG element from inside the wrapper
  const wrapper = outputElement.firstChild as Element;
  const svgElement = wrapper.querySelector('svg');
  if (!svgElement || svgElement.tagName !== 'svg') {
    return null; // No SVG found
  }
  
  // Sync UI state to manager before collecting
  subExpressionUI?.syncFromUI();
  
  // Collect render options using unified function
  const options = collectRenderOptionsFromUI(subExpressionManager, currentTheme);
  
  // Use outerHTML to get the complete SVG element (not just innerHTML)
  const svg = svgElement.outerHTML;
  
  // Calculate scale from font-size (default MathJax font-size is 12px per em)
  const scale = options.fontSize / 16;
  
  return {
    tex: options.tex,
    svg,
    scale,
    display: options.display,
    bgcolor: options.backgroundColor,
    fontcolor: options.fontColor,
    fontsize: options.fontSize,
    subExpressionStyles: options.subExpressionStyles,
    updateExisting
  };
}

// Function to send update to Figma (with debouncing)
function sendUpdateToFigma() {
  if (!hasNodeLoaded) {
    return; // Don't update if no node is loaded
  }
  
  const data = prepareMessageData(true);
  if (!data) {
    return; // No SVG rendered yet
  }
  
  (window.parent as Window).postMessage({ pluginMessage: data }, '*');
}

// Debounced update function
function debouncedUpdate() {
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  updateTimer = setTimeout(() => {
    sendUpdateToFigma();
  }, 300); // 300ms debounce delay
}

// place the svg on the figma canvas (for new nodes)
(document.getElementById('place') as HTMLButtonElement).onclick = () => {
  const data = prepareMessageData(false);
  if (!data) {
    console.error('No SVG to embed');
    return;
  }
  (window.parent as Window).postMessage({ pluginMessage: data }, '*');
};

// Helper to sync color pickers and text inputs
function syncColorInputs(colorId: string) {
  const picker = document.getElementById(colorId + '-picker') as HTMLInputElement;
  const text = document.getElementById(colorId) as HTMLInputElement;
  // When picker changes, update text (without #) and convert
  picker.addEventListener('input', () => {
    const expanded = expandColor(picker.value);
    text.value = expanded;
    convert(); // This will trigger debouncedUpdate via convert()
  });
  // When text changes, update picker (with #) and convert (handled by onColorTextChange)
  const currentValue = text.value.trim() || picker.value.replace(/^#/, '');
  const expanded = expandColor(currentValue);
  text.value = expanded;
  picker.value = '#' + expanded;
}

function onColorTextChange(colorId: string) {
  const picker = document.getElementById(colorId + '-picker') as HTMLInputElement;
  const text = document.getElementById(colorId) as HTMLInputElement;
  const value = text.value.trim();
  
  // Expand color according to convention
  const expanded = expandColor(value);
  
  // Validate: should be 1-6 hex digits
  if (/^[0-9A-Fa-f]{1,6}$/i.test(value)) {
    // Update text with expanded value (without #)
    text.value = expanded.substring(0, 6); // Limit to 6 hex digits for RGB
    // Add # to picker (color inputs need # prefix)
    picker.value = '#' + expanded.substring(0, 6);
    convert(); // This will trigger debouncedUpdate via convert()
  }
}

// Function to detect and apply OS theme
function detectAndApplyOSTheme() {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = mediaQuery.matches;
  const theme = isDark ? 'dark' : 'light';
  
  // Update form inputs to match theme (CSS variables are handled by media query)
  applyTheme(theme);
  
  return theme;
}

// Locate button handler
(document.getElementById('locate-button') as HTMLButtonElement).onclick = () => {
  (window.parent as Window).postMessage({ 
    pluginMessage: { 
      type: 'locateNode'
    } 
  }, '*');
};

// Helper function to reliably select all text in an input
function selectAllText(event: FocusEvent | MouseEvent) {
  const target = event.target as HTMLInputElement;
  // Prevent default mouseup behavior that might interfere with selection
  if (event.type === 'mousedown' || event.type === 'click') {
    event.preventDefault();
  }
  // Use setTimeout to ensure selection happens after browser's default focus behavior
  setTimeout(() => {
    target.select();
  }, 0);
}

// Function to toggle preview expand/collapse
function togglePreview() {
  const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
  const previewOutput = document.getElementById('preview-output') as HTMLDivElement;
  
  if (previewContainer.classList.contains('expanded')) {
    previewContainer.classList.remove('expanded');
    previewOutput.classList.add('collapsed');
  } else {
    previewContainer.classList.add('expanded');
    previewOutput.classList.remove('collapsed');
  }
}

// Make functions available globally for inline handlers
(window as any).convert = convert;
(window as any).onColorTextChange = onColorTextChange;
(window as any).saveUserPreferences = saveUserPreferences;
(window as any).selectAllText = selectAllText;
(window as any).togglePreview = togglePreview;

// Initialize the plugin - handle both DOMContentLoaded and window.onload for compatibility
function initializePlugin() {
  // Initialize to create mode (this will also expand the preview)
  switchToCreateMode();
  
  // Detect and apply OS theme
  const detectedTheme = detectAndApplyOSTheme();
  
  // Set color pickers to match text values (with #)
  const bgcolorValue = (document.getElementById('bgcolor') as HTMLInputElement).value || (THEME_DEFAULTS as any)[currentTheme].background;
  const fontcolorValue = (document.getElementById('fontcolor') as HTMLInputElement).value || (THEME_DEFAULTS as any)[currentTheme].font;
  const bgcolorExpanded = expandColor(bgcolorValue);
  const fontcolorExpanded = expandColor(fontcolorValue);
  (document.getElementById('bgcolor-picker') as HTMLInputElement).value = '#' + bgcolorExpanded;
  (document.getElementById('fontcolor-picker') as HTMLInputElement).value = '#' + fontcolorExpanded;
  (document.getElementById('bgcolor') as HTMLInputElement).value = bgcolorExpanded;
  (document.getElementById('fontcolor') as HTMLInputElement).value = fontcolorExpanded;
  syncColorInputs('bgcolor');
  syncColorInputs('fontcolor');
  
  // Initialize sub-expression UI component
  const subExpressionContainer = document.getElementById('subexpression-styling') as HTMLElement;
  if (subExpressionContainer) {
    const errorCallbacks: SubExpressionErrorCallbacks = {
      showError: showSubExpressionError,
      clearError: clearSubExpressionError,
      clearAllErrors: clearSubExpressionErrors
    };
    subExpressionUI = new SubExpressionStylesUI(
      subExpressionContainer,
      subExpressionManager,
      errorCallbacks,
      convert, // onChange callback
      () => currentTheme, // theme getter
      updateSubExpressionStylesDirectly // direct styling update callback (for color picker)
    );
  }
  
  // Convert immediately - MathJax should be available since scripts are inlined
  convert();
}

// Try multiple initialization strategies for maximum compatibility
if (document.readyState === 'loading') {
  // DOM is still loading, wait for DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    initializePlugin();
  });
} else if (document.readyState === 'interactive' || document.readyState === 'complete') {
  // DOM is already loaded, initialize immediately
  initializePlugin();
} else {
  // Fallback to window.onload
  window.onload = () => {
    initializePlugin();
  };
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = (event.data as any).pluginMessage || {};
  
  // Handle theme change
  if (message.theme === 'dark' || message.theme === 'light') {
    applyTheme(message.theme);
    // Update color pickers to match new theme (with #)
    const bgcolorValue = (document.getElementById('bgcolor') as HTMLInputElement).value || (THEME_DEFAULTS as any)[message.theme].background;
    const fontcolorValue = (document.getElementById('fontcolor') as HTMLInputElement).value || (THEME_DEFAULTS as any)[message.theme].font;
    const bgcolorExpanded = expandColor(bgcolorValue);
    const fontcolorExpanded = expandColor(fontcolorValue);
    (document.getElementById('bgcolor-picker') as HTMLInputElement).value = '#' + bgcolorExpanded;
    (document.getElementById('fontcolor-picker') as HTMLInputElement).value = '#' + fontcolorExpanded;
    (document.getElementById('bgcolor') as HTMLInputElement).value = bgcolorExpanded;
    (document.getElementById('fontcolor') as HTMLInputElement).value = fontcolorExpanded;
    convert(); // re-render with new colors
  }
  
  // Handle user preferences load
  if (message.type === 'loadUserPreferences' && message.userPreferences) {
    const prefs = message.userPreferences;
    // Convert old format if needed (migration from old config)
    const renderOptions: RenderOptions = {
      tex: prefs.tex || '',
      display: prefs.display !== undefined ? prefs.display : true,
      fontSize: prefs.fontsize || prefs.fontSize || 24,
      backgroundColor: prefs.bgcolor || prefs.backgroundColor || '#000000',
      fontColor: prefs.fontcolor || prefs.fontColor || '#E0E0E0',
      subExpressionStyles: (prefs.subExpressionStyles || []).map((style: any) => ({
        expression: style.expression || style.tex || '',
        color: style.color || '#000000',
        occurrences: style.occurrences !== undefined ? style.occurrences : style.occurrence
      }))
    };
    
    applyRenderOptionsToUI(renderOptions, subExpressionManager, currentTheme);
    subExpressionUI?.syncToUI();
    convert(); // Apply loaded preferences
  }
  
  // Handle node data load (when selecting a node with plugin data)
  if (message.type === 'loadNodeData') {
    const { texSource, renderOptions, nodeId } = message;
    
    // Switch to edit mode
    switchToEditMode(nodeId);
    
    // Convert render options to new format if needed (migration from old format)
    if (renderOptions) {
      const options: RenderOptions = {
        tex: texSource || '',
        display: renderOptions.display !== undefined ? renderOptions.display : true,
        fontSize: renderOptions.fontSize || 16,
        backgroundColor: renderOptions.backgroundColor || '#000000',
        fontColor: renderOptions.fontColor || '#E0E0E0',
        subExpressionStyles: (renderOptions.subExpressionStyles || []).map((style: any) => ({
          expression: style.expression || style.tex || '',
          color: style.color || '#000000',
          occurrences: style.occurrences !== undefined ? style.occurrences : style.occurrence
        }))
      };
      
      applyRenderOptionsToUI(options, subExpressionManager, currentTheme);
      subExpressionUI?.syncToUI();
    }
    
    // Re-render with loaded data (but don't trigger update)
    isLoadingNodeData = true;
    convert();
    // Reset flag after a short delay to allow convert to complete
    setTimeout(() => {
      isLoadingNodeData = false;
    }, 100);
  }
  
  // Handle clearing node data (when no node with plugin data is selected)
  if (message.type === 'clearNodeData') {
    switchToCreateMode();
  }
});
