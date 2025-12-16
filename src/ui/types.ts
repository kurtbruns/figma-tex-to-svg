/**
 * Type definitions for render options and user preferences
 */

/**
 * Represents a style to apply to a sub-expression within the TeX
 */
export interface SubExpressionStyle {
  /** The TeX sub-expression to match (e.g., "x^2", "\\frac{a}{b}") */
  expression: string;
  /** Normalized hex color with # prefix (e.g., "#FF0000") */
  color: string;
  /** Optional: comma-separated occurrence indices (1-based), e.g., "1,3" for first and third matches */
  occurrences?: string;
}

/**
 * Options for rendering a math expression
 */
export interface RenderOptions {
  /** The TeX source string */
  tex: string;
  /** Whether to render in display style (block) or inline */
  display: boolean;
  /** Font size in pixels */
  fontSize: number;
  /** Background color as normalized hex with # prefix (e.g., "#FFFFFF") */
  backgroundColor: string;
  /** Font color as normalized hex with # prefix (e.g., "#000000") */
  fontColor: string;
  /** Array of sub-expression styles to apply */
  subExpressionStyles: SubExpressionStyle[];
}

/**
 * User preferences (default render options stored in clientStorage)
 * Same structure as RenderOptions but represents user defaults
 */
export interface UserPreferences extends RenderOptions {
  // Could add user-specific preferences here in the future (e.g., theme preferences)
}

