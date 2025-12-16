/**
 * Color utility functions
 */

/**
 * Expand color according to convention:
 * 1 digit -> repeat 6 times (2 -> 222222)
 * 2 digits -> repeat 3 times (20 -> 202020)
 * 3 digits -> duplicate each digit (123 -> 112233)
 * 4+ digits -> return as is (should be 6 for RGB)
 * 
 * @param hex Hex color string (with or without # prefix)
 * @returns Expanded 6-digit hex color (without # prefix, uppercase)
 */
export function expandColor(hex: string): string {
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

