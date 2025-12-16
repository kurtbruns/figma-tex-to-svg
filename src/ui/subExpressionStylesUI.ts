/**
 * Sub-expression styles UI component
 * Handles DOM rendering and user interaction for sub-expression styling
 */

import { SubExpressionStylesManager } from './subExpressionStyles';
import { SubExpressionStyle } from './types';
import { SubExpressionErrorCallbacks } from './mathRenderer';
import { expandColor, getNextSubExpressionColor } from './utils';

/**
 * UI component for managing sub-expression styles
 */
export class SubExpressionStylesUI {
  private manager: SubExpressionStylesManager;
  private container: HTMLElement;
  private addButton: HTMLButtonElement;
  private errorCallbacks?: SubExpressionErrorCallbacks;
  private onChangeCallback?: () => void;
  private onDirectStylingUpdateCallback?: () => void;
  private getTheme: () => string;

  constructor(
    container: HTMLElement,
    manager: SubExpressionStylesManager,
    errorCallbacks?: SubExpressionErrorCallbacks,
    onChangeCallback?: () => void,
    getTheme?: () => string,
    onDirectStylingUpdateCallback?: () => void
  ) {
    this.container = container;
    this.manager = manager;
    this.errorCallbacks = errorCallbacks;
    this.onChangeCallback = onChangeCallback;
    this.onDirectStylingUpdateCallback = onDirectStylingUpdateCallback;
    this.getTheme = getTheme || (() => 'dark'); // Default to dark theme

    // Find or create the rows container
    let rowsContainer = container.querySelector('#subexpression-rows') as HTMLDivElement;
    if (!rowsContainer) {
      rowsContainer = document.createElement('div');
      rowsContainer.id = 'subexpression-rows';
      container.appendChild(rowsContainer);
    }

    // Find or create the add button
    this.addButton = container.querySelector('#add-subexpression-btn') as HTMLButtonElement;
    if (!this.addButton) {
      this.addButton = document.createElement('button');
      this.addButton.id = 'add-subexpression-btn';
      this.addButton.textContent = 'Add sub-expression style';
      container.appendChild(this.addButton);
    }

    this.addButton.onclick = () => this.onAdd();

    this.render();
  }

  /**
   * Render the UI from the manager state
   */
  render(): void {
    const rowsContainer = this.container.querySelector('#subexpression-rows') as HTMLDivElement;
    if (!rowsContainer) return;

    // Clear existing rows
    rowsContainer.innerHTML = '';

    // Render each style
    const styles = this.manager.getAll();
    styles.forEach((style, index) => {
      this.renderRow(rowsContainer, style, index);
    });
  }

  /**
   * Render a single row
   */
  private renderRow(container: HTMLElement, style: SubExpressionStyle, index: number): void {
    const row = document.createElement('div');
    row.className = 'subexpression-row';
    row.setAttribute('data-row-index', index.toString());

    // Normalize color: strip # prefix if present, then expand (text inputs don't have #)
    const colorValueRaw = style.color.replace(/^#/, '') || '5DA6F7';
    const colorValue = expandColor(colorValueRaw);
    const occurrenceValue = style.occurrences || '';

    row.innerHTML = `
      <input type="text" class="subexpression-tex" placeholder="exp" value="${this.escapeHtml(style.expression)}" 
             data-row-index="${index}">
      <div class="color-inputs">
        <input type="color" class="subexpression-color-picker" value="#${colorValue}" 
               data-row-index="${index}">
        <input type="text" class="subexpression-color" maxlength="6" placeholder="808080" value="${colorValue}" 
               data-row-index="${index}"
               onfocus="this.select()"
               onmousedown="event.preventDefault(); this.select()">
      </div>
      <input type="text" class="subexpression-occurrence" placeholder="1,2 ..." value="${this.escapeHtml(occurrenceValue)}" 
             data-row-index="${index}">
      <button data-row-index="${index}">−</button>
      <div class="error-message error-tex" style="display: none;"></div>
      <div class="error-message error-color" style="display: none;"></div>
      <div class="error-message error-occurrence" style="display: none;"></div>
      <div class="grid-spacer"></div>
    `;

    // Attach event listeners
    const texInput = row.querySelector('.subexpression-tex') as HTMLInputElement;
    const colorPicker = row.querySelector('.subexpression-color-picker') as HTMLInputElement;
    const colorText = row.querySelector('.subexpression-color') as HTMLInputElement;
    const occurrenceInput = row.querySelector('.subexpression-occurrence') as HTMLInputElement;
    const removeButton = row.querySelector('button') as HTMLButtonElement;

    texInput.addEventListener('change', () => this.onUpdate(index, 'expression', texInput.value.trim()));
    texInput.addEventListener('input', () => {
      this.onUpdate(index, 'expression', texInput.value.trim());
      this.onChangeCallback?.();
    });

    colorPicker.addEventListener('input', () => {
      const expanded = expandColor(colorPicker.value);
      colorText.value = expanded;
      this.onUpdate(index, 'color', '#' + expanded);
      // Directly update styling from manager state (bypass DOM sync for immediate update)
      this.onDirectStylingUpdateCallback?.();
    });

    colorPicker.addEventListener('change', () => {
      const expanded = expandColor(colorPicker.value);
      colorText.value = expanded;
      this.onUpdate(index, 'color', '#' + expanded);
      this.onChangeCallback?.();
    });

    colorText.addEventListener('input', () => {
      const value = colorText.value.trim();
      if (/^[0-9A-Fa-f]{1,6}$/i.test(value)) {
        const expanded = expandColor(value);
        colorPicker.value = '#' + expanded.substring(0, 6);
      }
      this.onChangeCallback?.();
    });

    colorText.addEventListener('change', () => {
      const value = colorText.value.trim();
      if (/^[0-9A-Fa-f]{1,6}$/i.test(value)) {
        const expanded = expandColor(value);
        colorText.value = expanded.substring(0, 6);
        colorPicker.value = '#' + expanded.substring(0, 6);
        this.onUpdate(index, 'color', '#' + expanded);
      }
    });

    occurrenceInput.addEventListener('change', () => {
      this.onUpdate(index, 'occurrences', occurrenceInput.value.trim());
      this.onChangeCallback?.();
    });
    occurrenceInput.addEventListener('input', () => {
      this.onUpdate(index, 'occurrences', occurrenceInput.value.trim());
      this.onChangeCallback?.();
    });

    removeButton.addEventListener('click', () => this.onRemove(index));

    container.appendChild(row);
  }

  /**
   * Sync manager state from UI inputs
   */
  syncFromUI(): void {
    const rows = Array.from(this.container.querySelectorAll('.subexpression-row'));
    const styles: SubExpressionStyle[] = [];

    rows.forEach((row) => {
      const texInput = row.querySelector('.subexpression-tex') as HTMLInputElement;
      const colorInput = row.querySelector('.subexpression-color') as HTMLInputElement;
      const occurrenceInput = row.querySelector('.subexpression-occurrence') as HTMLInputElement;

      if (texInput && colorInput && occurrenceInput) {
        // Normalize color: expand and add # prefix
        const normalizedColor = '#' + expandColor(colorInput.value.trim());
        styles.push({
          expression: texInput.value.trim(),
          color: normalizedColor,
          occurrences: occurrenceInput.value.trim() || undefined
        });
      }
    });

    // Update manager
    this.manager.clear();
    styles.forEach(style => this.manager.add(style));
  }

  /**
   * Sync UI from manager state
   */
  syncToUI(): void {
    this.render();
  }

  /**
   * Handle add button click
   */
  onAdd(): void {
    const currentCount = this.manager.getCount();
    const theme = this.getTheme();
    const nextColor = getNextSubExpressionColor(theme, currentCount);
    
    this.manager.add({
      expression: '',
      color: nextColor,
      occurrences: undefined
    });
    this.render();
    this.onChangeCallback?.();
  }

  /**
   * Handle remove button click
   */
  onRemove(index: number): void {
    this.manager.remove(index);
    this.render();
    this.onChangeCallback?.();
  }

  /**
   * Handle field update
   */
  private onUpdate(index: number, field: string, value: string): void {
    const style = this.manager.get(index);
    if (!style) return;

    if (field === 'expression') {
      this.manager.update(index, { expression: value });
      this.errorCallbacks?.clearError?.(index, 'tex');
    } else if (field === 'color') {
      this.manager.update(index, { color: value });
      this.errorCallbacks?.clearError?.(index, 'color');
    } else if (field === 'occurrences') {
      this.manager.update(index, { occurrences: value || undefined });
      this.errorCallbacks?.clearError?.(index, 'occurrence');
    }
  }

  /**
   * Show error for a specific field
   * Field names: 'tex' (for expression), 'color', 'occurrence'
   */
  showError(rowIndex: number, field: string, message: string): void {
    const row = this.container.querySelector(`.subexpression-row[data-row-index="${rowIndex}"]`);
    if (row) {
      // Map 'expression' to 'tex' for DOM class name
      const domField = field === 'expression' ? 'tex' : field;
      const errorDiv = row.querySelector(`.error-${domField}`) as HTMLElement;
      if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
      }
    }
  }

  /**
   * Clear error for a specific field
   * Field names: 'tex' (for expression), 'color', 'occurrence'
   */
  clearError(rowIndex: number, field: string): void {
    const row = this.container.querySelector(`.subexpression-row[data-row-index="${rowIndex}"]`);
    if (row) {
      // Map 'expression' to 'tex' for DOM class name
      const domField = field === 'expression' ? 'tex' : field;
      const errorDiv = row.querySelector(`.error-${domField}`) as HTMLElement;
      if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
      }
    }
  }

  /**
   * Clear all errors
   */
  clearAllErrors(): void {
    this.container.querySelectorAll('.error-message').forEach((el) => {
      (el as HTMLElement).textContent = '';
      (el as HTMLElement).style.display = 'none';
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

