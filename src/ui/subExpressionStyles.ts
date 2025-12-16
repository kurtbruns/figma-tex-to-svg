/**
 * Sub-expression styles manager
 * Handles data model operations for sub-expression styling
 */

import { SubExpressionStyle } from './types';

/**
 * Manages a collection of sub-expression styles
 */
export class SubExpressionStylesManager {
  private styles: SubExpressionStyle[] = [];

  /**
   * Add a new sub-expression style
   */
  add(style: SubExpressionStyle): void {
    this.styles.push({ ...style });
  }

  /**
   * Remove a sub-expression style by index
   */
  remove(index: number): void {
    if (index >= 0 && index < this.styles.length) {
      this.styles.splice(index, 1);
    }
  }

  /**
   * Update a sub-expression style at the given index
   */
  update(index: number, updates: Partial<SubExpressionStyle>): void {
    if (index >= 0 && index < this.styles.length) {
      this.styles[index] = { ...this.styles[index], ...updates };
    }
  }

  /**
   * Get all sub-expression styles
   */
  getAll(): SubExpressionStyle[] {
    return this.styles.map(style => ({ ...style }));
  }

  /**
   * Clear all sub-expression styles
   */
  clear(): void {
    this.styles = [];
  }

  /**
   * Get the number of styles
   */
  getCount(): number {
    return this.styles.length;
  }

  /**
   * Get a style by index
   */
  get(index: number): SubExpressionStyle | undefined {
    if (index >= 0 && index < this.styles.length) {
      return { ...this.styles[index] };
    }
    return undefined;
  }

  /**
   * Serialize to JSON-compatible array
   */
  toJSON(): SubExpressionStyle[] {
    return this.getAll();
  }

  /**
   * Deserialize from JSON-compatible array
   */
  fromJSON(data: any[]): void {
    this.clear();
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item && typeof item === 'object') {
          // Handle migration from old format {tex, color, occurrence} to new format
          const style: SubExpressionStyle = {
            expression: item.expression || item.tex || '',
            color: item.color || '#000000',
            occurrences: item.occurrences !== undefined ? item.occurrences : item.occurrence
          };
          // Only add if expression is not empty
          if (style.expression) {
            this.add(style);
          }
        }
      });
    }
  }
}

