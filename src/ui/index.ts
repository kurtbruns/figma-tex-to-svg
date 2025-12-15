// Entry point for the UI when served via webpack-dev-server.
// This file contains the logic originally in ui.html's inline <script> block.

import './styles.css';
import { typesetMath, TypesettingOptions, SubExpressionErrorCallbacks } from './mathRenderer';

// Frontend color normalization
// Handles all color expansion logic before sending to backend
// Backend expects normalized 6-digit hex colors with # prefix (e.g., "#FFFFFF")
// Expand color according to convention:
// 1 digit -> repeat 6 times (2 -> 222222)
// 2 digits -> repeat 3 times (20 -> 202020)
// 3 digits -> duplicate each digit (123 -> 112233)
// All colors sent to backend must include # prefix
function expandColor(hex: string): string {
  if (!hex) return '';
  // Remove # if present and convert to uppercase
  const cleaned = hex.replace(/^#/, '').toUpperCase();
  if (cleaned.length === 1) {
    // 1 digit -> repeat 6 times
    return cleaned.repeat(6);
  } else if (cleaned.length === 2) {
    // 2 digits -> repeat 3 times
    return cleaned.repeat(3);
  } else if (cleaned.length === 3) {
    // 3 digits -> duplicate each digit
    return cleaned.split('').map(c => c + c).join('');
  }
  // 4+ digits -> return as is (should be 6 for RGB)
  return cleaned;
}

// Theme defaults in one place (without # prefix)
const THEME_DEFAULTS = {
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

let currentTheme: string = 'dark'; // fallback

// Sub-expression styling state
let subExpressionStyles: Array<{tex: string, color: string, occurrence: string}> = [];
let subExpressionRowCounter = 0;

function applyTheme(theme: string) {
  const defaults = (THEME_DEFAULTS as any)[theme] || THEME_DEFAULTS.dark;
  (document.getElementById('bgcolor') as HTMLInputElement).value = defaults.background;
  (document.getElementById('fontcolor') as HTMLInputElement).value = defaults.font;
  // Update color pickers to match (color inputs need # prefix)
  (document.getElementById('bgcolor-picker') as HTMLInputElement).value = '#' + defaults.background;
  (document.getElementById('fontcolor-picker') as HTMLInputElement).value = '#' + defaults.font;
  currentTheme = theme;
}

function saveConfig() {
  const display = (document.getElementById("display") as HTMLInputElement).checked;
  const bgcolorRaw = (document.getElementById("bgcolor") as HTMLInputElement).value.trim() || (THEME_DEFAULTS as any)[currentTheme].background;
  const fontcolorRaw = (document.getElementById("fontcolor") as HTMLInputElement).value.trim() || (THEME_DEFAULTS as any)[currentTheme].font;
  // Expand colors and add # prefix (backend expects normalized 6-digit hex with #)
  const bgcolor = '#' + expandColor(bgcolorRaw);
  const fontcolor = '#' + expandColor(fontcolorRaw);
  const fontsizeInput = (document.getElementById('fontsize') as HTMLInputElement).value;
  const fontsize = fontsizeInput ? parseFloat(fontsizeInput) : 24;
  
  // Collect sub-expression styles (normalize colors with # prefix)
  const styles: Array<{tex: string, color: string, occurrence: string}> = [];
  document.querySelectorAll('.subexpression-row').forEach((row) => {
    const texInput = row.querySelector('.subexpression-tex') as HTMLInputElement;
    const colorInput = row.querySelector('.subexpression-color') as HTMLInputElement;
    const occurrenceInput = row.querySelector('.subexpression-occurrence') as HTMLInputElement;
    if (texInput && colorInput && occurrenceInput) {
      // Normalize color: expand and add # prefix
      const normalizedColor = '#' + expandColor(colorInput.value.trim());
      styles.push({
        tex: texInput.value.trim(),
        color: normalizedColor,
        occurrence: occurrenceInput.value.trim()
      });
    }
  });
  
  (window.parent as Window).postMessage({ 
    pluginMessage: { 
      type: 'saveConfig',
      display,
      bgcolor,
      fontcolor,
      fontsize,
      subExpressionStyles: styles
    } 
  }, '*');
}

function showSubExpressionError(rowIndex: number, field: string, message: string) {
  const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
  if (row) {
    const errorDiv = row.querySelector(`.error-${field}`) as HTMLElement;
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }
}

function clearSubExpressionError(rowIndex: number, field: string) {
  const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
  if (row) {
    const errorDiv = row.querySelector(`.error-${field}`) as HTMLElement;
    if (errorDiv) {
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';
    }
  }
}

function clearSubExpressionErrors() {
  document.querySelectorAll('.error-message').forEach((el) => {
    (el as HTMLElement).textContent = '';
    (el as HTMLElement).style.display = 'none';
  });
}

// Sub-expression row management
function addSubExpressionRow(style: {tex: string, color: string, occurrence: string} | null = null) {
  const rowIndex = subExpressionRowCounter++;
  const rowsContainer = document.getElementById('subexpression-rows') as HTMLDivElement;
  
  const row = document.createElement('div');
  row.className = 'subexpression-row';
  row.setAttribute('data-row-index', rowIndex.toString());

  const texValue = style ? style.tex : '';
  // Normalize color: strip # prefix if present, then expand (text inputs don't have #)
  const colorValueRaw = style ? style.color.replace(/^#/, '') : '5DA6F7';
  const colorValue = expandColor(colorValueRaw);
  const occurrenceValue = style ? style.occurrence : '';

  row.innerHTML = `
    <div>
      <input type="text" class="subexpression-tex" placeholder="exp" value="${texValue}" 
             onchange="updateSubExpressionStyle(${rowIndex})" 
             oninput="updateSubExpressionStyle(${rowIndex}); convert();">
      <div class="error-message error-tex" style="display: none;"></div>
    </div>
    <div>
      <input type="color" class="subexpression-color-picker" value="#${colorValue}" 
             onchange="onSubExpressionColorChange(${rowIndex})">
      <input type="text" class="subexpression-color" maxlength="6" placeholder="808080" value="${colorValue}" 
             onchange="onSubExpressionColorTextChange(${rowIndex})" 
             oninput="onSubExpressionColorTextInput(${rowIndex}); convert();">
      <div class="error-message error-color" style="display: none;"></div>
    </div>
    <div>
      <input type="text" class="subexpression-occurrence" placeholder="1,3" value="${occurrenceValue}" 
             onchange="updateSubExpressionStyle(${rowIndex})" 
             oninput="updateSubExpressionStyle(${rowIndex}); convert();">
      <div class="error-message error-occurrence" style="display: none;"></div>
    </div>
    <button onclick="removeSubExpressionRow(${rowIndex})">−</button>
  `;

  rowsContainer.appendChild(row);
  
  // Initialize the style in the array (store normalized color without # for text input)
  if (!style) {
    subExpressionStyles.push({
      tex: '',
      color: colorValue,
      occurrence: ''
    });
  } else {
    // Store normalized color (without # prefix for consistency with text input)
    subExpressionStyles.push({
      tex: style.tex,
      color: colorValue,
      occurrence: style.occurrence
    });
  }

  // Sync color picker
  syncSubExpressionColorInputs(rowIndex);
}

function removeSubExpressionRow(rowIndex: number) {
  const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
  if (row) {
    row.remove();
    // Remove from array at the correct index
    if (rowIndex >= 0 && rowIndex < subExpressionStyles.length) {
      subExpressionStyles.splice(rowIndex, 1);
    }
    // Re-index rows
    reindexSubExpressionRows();
    convert();
  }
}

function reindexSubExpressionRows() {
  const rows = Array.from(document.querySelectorAll('.subexpression-row'));
  // Rebuild subExpressionStyles array to match current rows
  const newStyles: Array<{tex: string, color: string, occurrence: string}> = [];
  rows.forEach((row, newIndex) => {
    const oldIndex = parseInt(row.getAttribute('data-row-index') || '0');
    row.setAttribute('data-row-index', newIndex.toString());
    
    // Get current values from the row
    const texInput = row.querySelector('.subexpression-tex') as HTMLInputElement;
    const colorInput = row.querySelector('.subexpression-color') as HTMLInputElement;
    const occurrenceInput = row.querySelector('.subexpression-occurrence') as HTMLInputElement;
    
    if (oldIndex >= 0 && oldIndex < subExpressionStyles.length) {
      // Preserve the style data, but update with current input values
      newStyles.push({
        tex: texInput ? texInput.value.trim() : (subExpressionStyles[oldIndex].tex || ''),
        color: colorInput ? colorInput.value.trim() : (subExpressionStyles[oldIndex].color || '808080'),
        occurrence: occurrenceInput ? occurrenceInput.value.trim() : (subExpressionStyles[oldIndex].occurrence || '')
      });
    } else {
      // New row, get values from inputs
      newStyles.push({
        tex: texInput ? texInput.value.trim() : '',
        color: colorInput ? colorInput.value.trim() : '808080',
        occurrence: occurrenceInput ? occurrenceInput.value.trim() : ''
      });
    }
    
    // Update event handlers
    if (texInput) {
      texInput.setAttribute('onchange', `updateSubExpressionStyle(${newIndex})`);
      texInput.setAttribute('oninput', `updateSubExpressionStyle(${newIndex}); convert();`);
    }
    const colorPicker = row.querySelector('.subexpression-color-picker') as HTMLInputElement;
    if (colorPicker) {
      colorPicker.setAttribute('onchange', `onSubExpressionColorChange(${newIndex})`);
    }
    const colorText = row.querySelector('.subexpression-color') as HTMLInputElement;
    if (colorText) {
      colorText.setAttribute('onchange', `onSubExpressionColorTextChange(${newIndex})`);
      colorText.setAttribute('oninput', `onSubExpressionColorTextInput(${newIndex}); convert();`);
    }
    const occurrenceInputEl = row.querySelector('.subexpression-occurrence') as HTMLInputElement;
    if (occurrenceInputEl) {
      occurrenceInputEl.setAttribute('onchange', `updateSubExpressionStyle(${newIndex})`);
      occurrenceInputEl.setAttribute('oninput', `updateSubExpressionStyle(${newIndex}); convert();`);
    }
    const button = row.querySelector('button') as HTMLButtonElement;
    if (button) {
      button.setAttribute('onclick', `removeSubExpressionRow(${newIndex})`);
    }
  });
  subExpressionStyles = newStyles;
}

function updateSubExpressionStyle(rowIndex: number) {
  const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
  if (!row) return;

  const texInput = row.querySelector('.subexpression-tex') as HTMLInputElement;
  const colorInput = row.querySelector('.subexpression-color') as HTMLInputElement;
  const occurrenceInput = row.querySelector('.subexpression-occurrence') as HTMLInputElement;

  if (!texInput || !colorInput || !occurrenceInput) return;

  // Ensure array has entry at this index
  if (!subExpressionStyles[rowIndex]) {
    subExpressionStyles[rowIndex] = { tex: '', color: '808080', occurrence: '' };
  }

  subExpressionStyles[rowIndex].tex = texInput.value.trim();
  subExpressionStyles[rowIndex].color = colorInput.value.trim();
  subExpressionStyles[rowIndex].occurrence = occurrenceInput.value.trim();
}

function onSubExpressionColorChange(rowIndex: number) {
  const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
  if (!row) return;

  const picker = row.querySelector('.subexpression-color-picker') as HTMLInputElement;
  const text = row.querySelector('.subexpression-color') as HTMLInputElement;
  const expanded = expandColor(picker.value);
  text.value = expanded;
  updateSubExpressionStyle(rowIndex);
  convert();
}

// Handle color text input (on every keystroke) - only sync picker, don't expand
function onSubExpressionColorTextInput(rowIndex: number) {
  const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
  if (!row) return;

  const picker = row.querySelector('.subexpression-color-picker') as HTMLInputElement;
  const text = row.querySelector('.subexpression-color') as HTMLInputElement;
  const value = text.value.trim();
  
  // Only update picker if value is valid hex, but don't expand the text input
  if (/^[0-9A-Fa-f]{1,6}$/i.test(value)) {
    // Expand for picker only (picker needs 6 digits)
    const expanded = expandColor(value);
    picker.value = '#' + expanded.substring(0, 6);
  }
}

// Handle color text change (on Enter/blur) - expand the color
function onSubExpressionColorTextChange(rowIndex: number) {
  const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
  if (!row) return;

  const picker = row.querySelector('.subexpression-color-picker') as HTMLInputElement;
  const text = row.querySelector('.subexpression-color') as HTMLInputElement;
  const value = text.value.trim();
  
  // Expand color according to convention
  const expanded = expandColor(value);
  
  // Validate: should be 1-6 hex digits
  if (/^[0-9A-Fa-f]{1,6}$/i.test(value)) {
    // Update text with expanded value (without #)
    text.value = expanded.substring(0, 6);
    // Add # to picker (color inputs need # prefix)
    picker.value = '#' + expanded.substring(0, 6);
    updateSubExpressionStyle(rowIndex);
  }
}

function syncSubExpressionColorInputs(rowIndex: number) {
  const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
  if (!row) return;

  const picker = row.querySelector('.subexpression-color-picker') as HTMLInputElement;
  const text = row.querySelector('.subexpression-color') as HTMLInputElement;
  const currentValue = text.value.trim() || '808080';
  const expanded = expandColor(currentValue);
  text.value = expanded;
  picker.value = '#' + expanded;
}

function convert() {
  //  Get the TeX input
  const input = (document.getElementById("input") as HTMLTextAreaElement).value.trim();
  const bgcolorRaw = (document.getElementById("bgcolor") as HTMLInputElement).value.trim() || (THEME_DEFAULTS as any)[currentTheme].background;
  const fontcolorRaw = (document.getElementById("fontcolor") as HTMLInputElement).value.trim() || (THEME_DEFAULTS as any)[currentTheme].font;
  // Expand colors and add # prefix for CSS usage
  const bgcolor = '#' + expandColor(bgcolorRaw);
  const fontcolor = '#' + expandColor(fontcolorRaw);
  //  Disable the display button until MathJax is done
  const display = document.getElementById("display") as HTMLInputElement;
  display.disabled = true;
  //  Clear the old output
  const output = document.getElementById('output') as HTMLDivElement;
  output.innerHTML = '';
  output.style.background = bgcolor;
  
  // Get font-size
  const fontsizeInput = (document.getElementById('fontsize') as HTMLInputElement).value;
  const fontsize = fontsizeInput ? parseFloat(fontsizeInput) : 12;
  
  // Collect sub-expression styles from DOM inputs (normalize colors with # prefix)
  const normalizedSubExpressionStyles: Array<{tex: string, color: string, occurrence: string}> = [];
  document.querySelectorAll('.subexpression-row').forEach((row) => {
    const texInput = row.querySelector('.subexpression-tex') as HTMLInputElement;
    const colorInput = row.querySelector('.subexpression-color') as HTMLInputElement;
    const occurrenceInput = row.querySelector('.subexpression-occurrence') as HTMLInputElement;
    if (texInput && colorInput && occurrenceInput) {
      // Normalize color: expand and add # prefix
      const normalizedColor = '#' + expandColor(colorInput.value.trim());
      normalizedSubExpressionStyles.push({
        tex: texInput.value.trim(),
        color: normalizedColor,
        occurrence: occurrenceInput.value.trim()
      });
    }
  });
  
  // Create error callbacks for UI integration
  const errorCallbacks: SubExpressionErrorCallbacks = {
    showError: showSubExpressionError,
    clearError: clearSubExpressionError,
    clearAllErrors: clearSubExpressionErrors
  };
  
  // Prepare typesetting options
  const typesettingOptions: TypesettingOptions = {
    display: display.checked,
    fontSize: fontsize,
    fontColor: fontcolor,
    subExpressionStyles: normalizedSubExpressionStyles,
    outputElement: output,
    subExpressionErrorCallbacks: errorCallbacks
  };
  
  // Use the high-level typesetting function
  typesetMath(input, typesettingOptions)
    .then((node: HTMLElement) => {
      output.appendChild(node);
      
      // Trigger real-time update if node is loaded and we're not just loading data
      if (!isLoadingNodeData) {
        debouncedUpdate();
      }
    })
    .catch((err: Error) => {
      output.appendChild(document.createElement('pre')).appendChild(document.createTextNode(err.message));
    })
    .finally(() => {
      display.disabled = false;
    });
  
  // Save config after conversion
  saveConfig();
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
let draftState: {
  tex: string;
  display: boolean;
  bgcolor: string;
  fontcolor: string;
  fontsize: string;
  subExpressionStyles: Array<{tex: string, color: string, occurrence: string}>;
} | null = null;

// Function to save current draft state
function saveDraftState() {
  const styles: Array<{tex: string, color: string, occurrence: string}> = [];
  document.querySelectorAll('.subexpression-row').forEach((row) => {
    const texInput = row.querySelector('.subexpression-tex') as HTMLInputElement;
    const colorInput = row.querySelector('.subexpression-color') as HTMLInputElement;
    const occurrenceInput = row.querySelector('.subexpression-occurrence') as HTMLInputElement;
    if (texInput && colorInput && occurrenceInput) {
      styles.push({
        tex: texInput.value.trim(),
        color: colorInput.value.trim(),
        occurrence: occurrenceInput.value.trim()
      });
    }
  });

  draftState = {
    tex: (document.getElementById("input") as HTMLTextAreaElement).value.trim(),
    display: (document.getElementById("display") as HTMLInputElement).checked,
    bgcolor: (document.getElementById("bgcolor") as HTMLInputElement).value.trim(),
    fontcolor: (document.getElementById("fontcolor") as HTMLInputElement).value.trim(),
    fontsize: (document.getElementById("fontsize") as HTMLInputElement).value,
    subExpressionStyles: styles
  };
}

// Function to restore draft state
function restoreDraftState() {
  if (draftState) {
    (document.getElementById("input") as HTMLTextAreaElement).value = draftState.tex;
    (document.getElementById("display") as HTMLInputElement).checked = draftState.display;
    (document.getElementById("bgcolor") as HTMLInputElement).value = draftState.bgcolor;
    (document.getElementById("fontcolor") as HTMLInputElement).value = draftState.fontcolor;
    (document.getElementById("fontsize") as HTMLInputElement).value = draftState.fontsize;
    
    // Update color pickers
    const bgcolorExpanded = expandColor(draftState.bgcolor);
    const fontcolorExpanded = expandColor(draftState.fontcolor);
    (document.getElementById('bgcolor-picker') as HTMLInputElement).value = '#' + bgcolorExpanded;
    (document.getElementById('fontcolor-picker') as HTMLInputElement).value = '#' + fontcolorExpanded;
    
    // Restore sub-expression styles
    if (draftState.subExpressionStyles) {
      // Clear existing rows
      (document.getElementById('subexpression-rows') as HTMLDivElement).innerHTML = '';
      subExpressionStyles = [];
      subExpressionRowCounter = 0;
      
      // Add rows for each style
      draftState.subExpressionStyles.forEach(style => {
        addSubExpressionRow(style);
      });
    }
    
    // Re-render
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
  (document.getElementById('node-id-display') as HTMLSpanElement).textContent = '#' + (nodeId ? nodeId.substring(0, 8) : '');
  
  // Hide preview in edit mode
  const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
  previewContainer.classList.add('hidden');
  
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
  
  // Show preview in create mode
  const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
  previewContainer.classList.remove('hidden');
  
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
  console.log('svgElement', svgElement);
  if (!svgElement || svgElement.tagName !== 'svg') {
    return null; // No SVG found
  }
  
  const tex = (document.getElementById("input") as HTMLTextAreaElement).value.trim();
  // Use outerHTML to get the complete SVG element (not just innerHTML)
  const svg = svgElement.outerHTML;
  const fontsizeInput = (document.getElementById('fontsize') as HTMLInputElement).value;
  const fontsize = fontsizeInput ? parseFloat(fontsizeInput) : 16;
  const bgcolorRaw = (document.getElementById("bgcolor") as HTMLInputElement).value.trim() || (THEME_DEFAULTS as any)[currentTheme].background;
  const fontcolorRaw = (document.getElementById("fontcolor") as HTMLInputElement).value.trim() || (THEME_DEFAULTS as any)[currentTheme].font;
  
  // Normalize colors: expand and add # prefix (backend expects normalized 6-digit hex with #)
  const bgcolor = '#' + expandColor(bgcolorRaw);
  const fontcolor = '#' + expandColor(fontcolorRaw);
  
  // Calculate scale from font-size (default MathJax font-size is 12px per em)
  const scale = fontsize / 16;
  
  // Collect sub-expression styles (normalize colors with # prefix)
  const styles: Array<{tex: string, color: string, occurrence: string}> = [];
  document.querySelectorAll('.subexpression-row').forEach((row) => {
    const texInput = row.querySelector('.subexpression-tex') as HTMLInputElement;
    const colorInput = row.querySelector('.subexpression-color') as HTMLInputElement;
    const occurrenceInput = row.querySelector('.subexpression-occurrence') as HTMLInputElement;
    if (texInput && colorInput && occurrenceInput) {
      // Normalize color: expand and add # prefix
      const normalizedColor = '#' + expandColor(colorInput.value.trim());
      styles.push({
        tex: texInput.value.trim(),
        color: normalizedColor,
        occurrence: occurrenceInput.value.trim()
      });
    }
  });
  
  return {
    tex,
    svg,
    scale,
    bgcolor,  // Normalized 6-digit hex with # prefix (e.g., "#FFFFFF")
    fontcolor, // Normalized 6-digit hex with # prefix (e.g., "#000000")
    fontsize,
    subExpressionStyles: styles, // Colors normalized with # prefix
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

// Make functions available globally for inline handlers
(window as any).convert = convert;
(window as any).addSubExpressionRow = addSubExpressionRow;
(window as any).onColorTextChange = onColorTextChange;
(window as any).saveConfig = saveConfig;
(window as any).updateSubExpressionStyle = updateSubExpressionStyle;
(window as any).onSubExpressionColorChange = onSubExpressionColorChange;
(window as any).onSubExpressionColorTextInput = onSubExpressionColorTextInput;
(window as any).onSubExpressionColorTextChange = onSubExpressionColorTextChange;
(window as any).removeSubExpressionRow = removeSubExpressionRow;

// Initialize the plugin - handle both DOMContentLoaded and window.onload for compatibility
function initializePlugin() {

  // Initialize to create mode
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
  
  // Handle config load
  if (message.type === 'loadConfig' && message.config) {
    const config = message.config;
    if (config.display !== undefined) {
      (document.getElementById('display') as HTMLInputElement).checked = config.display;
    }
    if (config.bgcolor) {
      // Expand color (strip # prefix if present for backward compatibility)
      const bgcolorValue = expandColor(config.bgcolor.replace(/^#/, ''));
      (document.getElementById('bgcolor') as HTMLInputElement).value = bgcolorValue;
      (document.getElementById('bgcolor-picker') as HTMLInputElement).value = '#' + bgcolorValue;
    }
    if (config.fontcolor) {
      // Expand color (strip # prefix if present for backward compatibility)
      const fontcolorValue = expandColor(config.fontcolor.replace(/^#/, ''));
      (document.getElementById('fontcolor') as HTMLInputElement).value = fontcolorValue;
      (document.getElementById('fontcolor-picker') as HTMLInputElement).value = '#' + fontcolorValue;
    }
    if (config.fontsize) {
      (document.getElementById('fontsize') as HTMLInputElement).value = config.fontsize;
    }
    if (config.subExpressionStyles && Array.isArray(config.subExpressionStyles)) {
      // Clear existing rows
      (document.getElementById('subexpression-rows') as HTMLDivElement).innerHTML = '';
      subExpressionStyles = [];
      subExpressionRowCounter = 0;
      
      // Add rows for each style
      config.subExpressionStyles.forEach((style: {tex: string, color: string, occurrence: string}) => {
        addSubExpressionRow(style);
      });
    }
    convert(); // Apply loaded config
  }
  
  // Handle node data load (when selecting a node with plugin data)
  if (message.type === 'loadNodeData') {
    const { texSource, renderOptions, nodeId } = message;
    
    // Switch to edit mode
    switchToEditMode(nodeId);
    
    // Load TeX source
    if (texSource) {
      (document.getElementById('input') as HTMLTextAreaElement).value = texSource;
    }
    
    // Load render options
    if (renderOptions) {
      if (renderOptions.fontSize) {
        (document.getElementById('fontsize') as HTMLInputElement).value = renderOptions.fontSize;
      }
      
      if (renderOptions.fontColor) {
        // Remove # prefix if present, then expand
        const fontcolorValue = expandColor(renderOptions.fontColor.replace(/^#/, ''));
        (document.getElementById('fontcolor') as HTMLInputElement).value = fontcolorValue;
        (document.getElementById('fontcolor-picker') as HTMLInputElement).value = '#' + fontcolorValue;
      }
      
      if (renderOptions.backgroundColor) {
        // Remove # prefix if present, then expand
        const bgcolorValue = expandColor(renderOptions.backgroundColor.replace(/^#/, ''));
        (document.getElementById('bgcolor') as HTMLInputElement).value = bgcolorValue;
        (document.getElementById('bgcolor-picker') as HTMLInputElement).value = '#' + bgcolorValue;
      }
      
      if (renderOptions.subExpressionStyles && Array.isArray(renderOptions.subExpressionStyles)) {
        // Clear existing rows
        (document.getElementById('subexpression-rows') as HTMLDivElement).innerHTML = '';
        subExpressionStyles = [];
        subExpressionRowCounter = 0;
        
        // Add rows for each style
        renderOptions.subExpressionStyles.forEach((style: {tex: string, color: string, occurrence: string}) => {
          addSubExpressionRow(style);
        });
      }
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
