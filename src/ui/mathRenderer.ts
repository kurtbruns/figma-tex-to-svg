// Math rendering and SVG manipulation utilities
// This module handles all MathJax rendering and SVG styling logic

// Declare MathJax types for TypeScript
declare global {
  interface Window {
    MathJax?: {
      tex2svg: (tex: string, options?: any) => HTMLElement;
      tex2svgPromise: (tex: string, options?: any) => Promise<HTMLElement>;
      texReset: () => void;
      getMetricsFor: (element: HTMLElement) => any;
      startup?: {
        document: {
          clear: () => void;
          updateDocument: () => void;
        };
        ready: () => Promise<void>;
      };
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
    };
  }
}

export interface TypesettingOptions {
  display: boolean;
  fontSize: number;
  fontColor: string; // Expected to be normalized 6-digit hex with # prefix (e.g., "#FFFFFF")
  subExpressionStyles: Array<{ tex: string, color: string, occurrence: string }>; // Colors expected to be normalized with # prefix
  outputElement?: HTMLElement; // Optional output element for MathJax metrics
  subExpressionErrorCallbacks?: SubExpressionErrorCallbacks; // Optional error callbacks for sub-expression styling
}

export interface SubExpressionErrorCallbacks {
  showError?: (rowIndex: number, field: string, message: string) => void;
  clearError?: (rowIndex: number, field: string) => void;
  clearAllErrors?: () => void;
}

/**
 * Sets color on all SVG elements
 */
export function setSVGColor(svgElement: HTMLElement, color: string): void {
  // Set color on the root SVG element
  // svgElement.setAttribute('color', color);
  svgElement.style.color = color;

  // Set fill style on all g elements
  const gElements = svgElement.querySelectorAll('g');
  gElements.forEach((el: Element) => {
    (el as HTMLElement).style.fill = color;
  });
}

/**
 * Finds matching subtrees in rendered math
 */
export function findSubtreeMatches(root: Element, subtree: Element): Element[][] {
  const matches: Element[][] = [];

  function nodeMatches(node: Element, subtreeNode: Element): boolean {
    if (node.tagName !== subtreeNode.tagName) {
      return false;
    }
    if (node.getAttribute('data-mml-node') !== subtreeNode.getAttribute('data-mml-node')) {
      return false;
    }
    if (node.hasAttribute('data-c') && node.getAttribute('data-c') !== subtreeNode.getAttribute('data-c')) {
      return false;
    }

    const nodeChildren = Array.from(node.children);
    const subtreeChildren = Array.from(subtreeNode.children);

    if (nodeChildren.length !== subtreeChildren.length) {
      return false;
    }

    for (let i = 0; i < nodeChildren.length; i++) {
      if (!nodeMatches(nodeChildren[i], subtreeChildren[i])) {
        return false;
      }
    }

    return true;
  }

  function traverse(node: Element) {
    Array.from(node.children).forEach((child) => {
      // Check if the child node is a deep match
      if (nodeMatches(child, subtree)) {
        matches.push([child]);
      }

      // Check to see if there is a sequential match
      let currentChild: Element | null = child;
      let currentNode: ChildNode | null = subtree.firstChild;
      const potentialMatch: Element[] = [];
      let lastMatch: ChildNode | null = null;
      while (currentNode && currentChild && nodeMatches(currentChild, currentNode as Element)) {
        potentialMatch.push(currentChild);
        lastMatch = currentNode;
        currentChild = currentChild.nextElementSibling;
        currentNode = currentNode.nextSibling;
      }

      // If the sequence matched all of the subtrees nodes then its a match
      if (lastMatch === subtree.lastChild) {
        matches.push(potentialMatch);
      }
    });

    Array.from(node.children).forEach(child => {
      traverse(child);
    });
  }

  traverse(root);
  return matches;
}

/**
 * Compares document position of two nodes
 */
export function compareNodePosition(nodeA: Element, nodeB: Element): number {
  if (!nodeA || !nodeB) return 0;

  // Use compareDocumentPosition for reliable ordering
  const comparison = nodeA.compareDocumentPosition(nodeB);

  // If nodeA comes before nodeB, return -1
  if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }
  // If nodeA comes after nodeB, return 1
  if (comparison & Node.DOCUMENT_POSITION_PRECEDING) {
    return 1;
  }

  // Fallback to bounding box comparison if nodes are in different documents
  const bboxA = nodeA.getBoundingClientRect();
  const bboxB = nodeB.getBoundingClientRect();
  // First sort by y (top to bottom), then by x (left to right)
  if (Math.abs(bboxA.top - bboxB.top) > 1) { // Allow 1px tolerance for "same line"
    return bboxA.top - bboxB.top;
  }
  return bboxA.left - bboxB.left;
}

/**
 * Sorts matches by document position (left-to-right, top-to-bottom)
 */
export function sortMatchesByPosition(matches: Element[][]): Element[][] {
  return matches.sort((a, b) => {
    if (a.length === 0 || b.length === 0) {
      return a.length - b.length;
    }
    // Compare the first node of each match
    return compareNodePosition(a[0], b[0]);
  });
}

/**
 * Gets matches for a TeX expression in the rendered SVG
 */
export function getMatchesByTex(tex: string, svgElement: HTMLElement): Element[][] | null {
  if (!window.MathJax || !window.MathJax.tex2svg) {
    return null;
  }

  try {
    // Render the sub-expression
    const output = window.MathJax.tex2svg(tex, {});
    const matchRendered = output.firstChild as Element;

    // Find the math nodes
    const tree = svgElement.querySelector('[data-mml-node="math"]');
    const match = matchRendered.querySelector('[data-mml-node="math"]');

    if (!tree || !match) {
      return null;
    }

    const matches = findSubtreeMatches(tree, match);
    // Sort matches by document position to ensure correct order
    return sortMatchesByPosition(matches);
  } catch (err) {
    console.error('Error matching sub-expression:', err);
    return null;
  }
}

/**
 * Applies colors to sub-expressions in the rendered SVG
 * @param svgElement The rendered SVG element
 * @param styles Array of sub-expression styles (colors should be normalized with # prefix)
 * @param errorCallbacks Optional callbacks for error handling (for UI integration)
 * @param expandColor Optional function to expand color codes (if colors aren't pre-normalized)
 */
export function applySubExpressionColors(
  svgElement: HTMLElement,
  styles: Array<{ tex: string, color: string, occurrence: string }>,
  errorCallbacks?: SubExpressionErrorCallbacks,
  expandColor?: (hex: string) => string
): void {
  // Clear previous validation errors if callback provided
  if (errorCallbacks?.clearAllErrors) {
    errorCallbacks.clearAllErrors();
  }

  if (!styles || styles.length === 0) {
    return;
  }

  styles.forEach((style, styleIndex) => {
    const { tex, color, occurrence } = style;

    if (!tex || !tex.trim()) {
      return; // Skip empty sub-expressions
    }

    // Find matches
    const matches = getMatchesByTex(tex.trim(), svgElement);
    if (!matches || matches.length === 0) {
      // Show error: sub-expression not found
      if (errorCallbacks?.showError) {
        errorCallbacks.showError(styleIndex, 'tex', `Sub-expression '${tex}' not found in the TeX`);
      }
      return;
    }

    // Normalize color - use expandColor if provided, otherwise assume already normalized
    let normalizedColor: string;
    if (expandColor) {
      normalizedColor = '#' + expandColor(color || '000000');
    } else {
      // Assume color is already normalized (with # prefix)
      normalizedColor = color || '#000000';
      // Ensure # prefix
      if (!normalizedColor.startsWith('#')) {
        normalizedColor = '#' + normalizedColor;
      }
    }

    // Handle occurrence
    const occurrenceStr = (occurrence || '').trim();

    if (occurrenceStr === '') {
      // Apply to all matches
      matches.forEach(matchedNodes => {
        matchedNodes.forEach(node => {
          console.log('node', node);
          if ((node as HTMLElement).style) {
            (node as HTMLElement).style.fill = normalizedColor;
          }
        });
      });
      if (errorCallbacks?.clearError) {
        errorCallbacks.clearError(styleIndex, 'tex');
        errorCallbacks.clearError(styleIndex, 'occurrence');
      }
    } else {
      // Parse comma-separated integers (1-based indexing)
      const occurrenceIndices = occurrenceStr.split(',').map(s => s.trim()).filter(s => s !== '');
      const parsedIndices: number[] = [];
      let hasError = false;

      for (const idxStr of occurrenceIndices) {
        const idx = parseInt(idxStr, 10);
        if (isNaN(idx)) {
          if (errorCallbacks?.showError) {
            errorCallbacks.showError(styleIndex, 'occurrence', `Invalid occurrence number: '${idxStr}'`);
          }
          hasError = true;
          break;
        }
        // Convert from 1-based to 0-based for array access
        const arrayIndex = idx - 1;
        if (idx < 1 || arrayIndex >= matches.length) {
          const range = matches.length > 0 ? `1-${matches.length}` : 'none';
          if (errorCallbacks?.showError) {
            errorCallbacks.showError(styleIndex, 'occurrence', `Occurrence ${idx} is out of range. Found ${matches.length} instance(s) (valid range: ${range})`);
          }
          hasError = true;
          break;
        }
        parsedIndices.push(arrayIndex);
      }

      if (!hasError) {
        // Apply to specific occurrences (using 0-based array indices)
        parsedIndices.forEach(arrayIndex => {
          if (matches[arrayIndex]) {
            matches[arrayIndex].forEach(node => {
              if ((node as HTMLElement).style) {
                (node as HTMLElement).style.fill = normalizedColor;
              }
            });
          }
        });
        if (errorCallbacks?.clearError) {
          errorCallbacks.clearError(styleIndex, 'tex');
          errorCallbacks.clearError(styleIndex, 'occurrence');
        }
      }
    }
  });
}

/**
 * Checks if MathJax is available and ready
 */
export function isMathJaxReady(): boolean {
  return !!(window.MathJax && (window.MathJax.tex2svgPromise || window.MathJax.tex2svg));
}

/**
 * Main typesetting function that renders TeX to SVG with styling
 * @param tex The TeX input string
 * @param options Typesetting options
 * @returns Promise that resolves to the rendered SVG element
 */
export function typesetMath(tex: string, options: TypesettingOptions): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    if (!window.MathJax) {
      reject(new Error('MathJax is not loaded. Please wait a moment and try again.'));
      return;
    }

    if (!isMathJaxReady()) {
      reject(new Error('MathJax is not ready yet. Please wait a moment and try again.'));
      return;
    }

    // Reset MathJax state
    window.MathJax.texReset();

    // Get metrics from output element if provided, otherwise create a temporary element
    const metricsElement = options.outputElement || document.createElement('div');
    const mathJaxOptions = window.MathJax.getMetricsFor(metricsElement);
    mathJaxOptions.display = options.display;

    // Use tex2svgPromise if available, otherwise use tex2svg
    const renderPromise = window.MathJax.tex2svgPromise
      ? window.MathJax.tex2svgPromise(tex, mathJaxOptions)
      : Promise.resolve(window.MathJax.tex2svg(tex, mathJaxOptions));

    renderPromise.then((node: HTMLElement) => {

      let svgElement = node.firstChild as HTMLElement;
      
      // Set the color on all SVG elements after rendering
      setSVGColor(svgElement, options.fontColor);

      // Set font-size on the root SVG element (like vector library)
      node.setAttribute('font-size', options.fontSize + 'px');

      // Apply sub-expression colors (colors should already be normalized by caller)
      if (options.subExpressionStyles && options.subExpressionStyles.length > 0) {
        applySubExpressionColors(svgElement, options.subExpressionStyles, options.subExpressionErrorCallbacks);
      }

      // Clear MathJax document state
      if (window.MathJax && window.MathJax.startup) {
        window.MathJax.startup.document.clear();
        window.MathJax.startup.document.updateDocument();
      }

      resolve(node);
    }).catch((err: Error) => {
      reject(err);
    });
  });
}

