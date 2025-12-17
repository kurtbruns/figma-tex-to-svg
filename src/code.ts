/**
 * Plugin backend - handles Figma API operations
 */

import { UserPreferences } from './ui/types';
import { MATHJAX_DEFAULT_FONT_SIZE, DEFAULT_RENDER_OPTIONS } from './ui/utils/constants';

class PluginBackend {
  private currentNodeWithData: SceneNode | null = null;

  /**
   * Initialize the plugin backend
   */
  initialize(): Promise<void> {
    // Handle reset command if triggered from menu
    if (figma.command === 'resetDefaults') {
      return this.handleResetDefaults();
    }

    // Always use the bundled HTML exposed via Figma's __html__ variable.
    // CSS is inlined in both dev and prod builds, so this works in both modes.
    figma.showUI(__html__, { themeColors: true });
    figma.ui.resize(420, 560);

    // Set up event listeners
    this.setupEventListeners();

    // Send initialization data (preferences, selection, theme) in a single message
    this.sendInitializationData();

    return Promise.resolve();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for selection changes
    figma.on('selectionchange', () => {
      // Clear tracked node if selection is empty
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        this.currentNodeWithData = null;
        figma.ui.postMessage({ type: 'clearNodeData' });
      } else {
        this.checkSelectionAndLoadData();
      }
    });

    // Set up message handler
    figma.ui.onmessage = (pluginMessage) => {
      this.handleMessage(pluginMessage);
    };
  }

  /**
   * Handle messages from the UI
   */
  private handleMessage(pluginMessage: any): Promise<void> {
    // Backend responsibilities:
    // - Handle Figma API operations (create/update nodes, manage selection)
    // - Convert normalized data to Figma formats (hex to RGB)
    // - Store/retrieve plugin data
    // Frontend responsibilities (ui.html):
    // - UI rendering and user interaction
    // - Color normalization and validation
    // - Data preparation and formatting before sending to backend

    // Handle user preferences save
    if (pluginMessage.type === 'saveUserPreferences') {
      return this.saveUserPreferences(pluginMessage);
    }

    // Handle locate node request
    if (pluginMessage.type === 'locateNode') {
      if (this.currentNodeWithData) {
        figma.currentPage.selection = [this.currentNodeWithData];
        this.focusViewportOnNodeBottomRight(this.currentNodeWithData);
      }
      return Promise.resolve();
    }

    // Handle SVG placement or update
    if (pluginMessage.svg) {
      this.createOrUpdateNode(pluginMessage);
    }

    return Promise.resolve();
  }

  /**
   * Save user preferences
   */
  private saveUserPreferences(pluginMessage: UserPreferences & { type: 'saveUserPreferences' }): Promise<void> {
    return figma.clientStorage.setAsync('userPreferences', {
      tex: pluginMessage.tex,
      display: pluginMessage.display,
      backgroundColor: pluginMessage.backgroundColor,
      fontColor: pluginMessage.fontColor,
      fontSize: pluginMessage.fontSize,
      subExpressionStyles: pluginMessage.subExpressionStyles || [],
      draftState: pluginMessage.draftState || null, // Include draftState field (null if not present)
    }).catch((err) => {
      console.error('Error saving user preferences:', err);
    });
  }

  /**
   * Handle reset to defaults command
   */
  private async handleResetDefaults(): Promise<void> {
    try {
      // Clear user preferences from storage
      await figma.clientStorage.deleteAsync('userPreferences');
      
      // Show UI
      figma.showUI(__html__, { themeColors: true });
      figma.ui.resize(420, 560);
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Send initialization data (with null preferences since they were cleared)
      // Then send reset message to trigger reset after initialization
      const selection = figma.currentPage.selection;
      const selectionData: { hasNode: boolean; nodeData?: { texSource: string; renderOptions: any; nodeId: string } } = {
        hasNode: false
      };
      this.currentNodeWithData = null;
      
      const theme = ('uiTheme' in figma) ? figma.uiTheme : 'dark';
      
      figma.ui.postMessage({
        type: 'initialize',
        userPreferences: null,
        selection: selectionData,
        theme: theme
      });
      
      // Send reset message to UI (this will trigger the reset after initialization)
      figma.ui.postMessage({ type: 'resetToDefaults' });
      
      // Show notification
      figma.notify('Plugin reset to default settings');
    } catch (err) {
      console.error('Error resetting plugin:', err);
      figma.notify('Error resetting plugin', { error: true });
    }
    
    return Promise.resolve();
  }

  /**
   * Send initialization data to UI
   * Combines user preferences, selection state, and theme in a single message
   * This eliminates race conditions between separate messages
   */
  private sendInitializationData(): void {
    // Load user preferences
    figma.clientStorage.getAsync('userPreferences')
      .then((userPreferences: UserPreferences | undefined) => {
        // Check selection state
        const selection = figma.currentPage.selection;
        let selectionData: { hasNode: boolean; nodeData?: { texSource: string; renderOptions: any; nodeId: string } } = {
          hasNode: false
        };

        if (selection.length === 1) {
          let node: SceneNode | null = selection[0];
          
          // Check the node and its parents for plugin data
          while (node) {
            const texSource = node.getPluginData("texSource");
            const renderOptionsStr = node.getPluginData("renderOptions");
            
            if (texSource && renderOptionsStr) {
              try {
                const renderOptions = JSON.parse(renderOptionsStr);
                // Track this node as the current node with data
                this.currentNodeWithData = node;
                selectionData = {
                  hasNode: true,
                  nodeData: {
                    texSource,
                    renderOptions,
                    nodeId: node.id
                  }
                };
                break; // Found data, stop searching
              } catch (err) {
                console.error('Error parsing renderOptions:', err);
              }
            }
            
            // Check parent if available (only SceneNode types, not PAGE or DOCUMENT)
            if ('parent' in node && node.parent) {
              const parent = node.parent;
              if (parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
                node = parent as SceneNode;
              } else {
                node = null;
              }
            } else {
              node = null;
            }
          }
        }
        
        // No node with plugin data found
        if (!selectionData.hasNode) {
          this.currentNodeWithData = null;
        }

        // Get theme
        const theme = ('uiTheme' in figma) ? figma.uiTheme : 'dark';

        // Send combined initialization message
        figma.ui.postMessage({
          type: 'initialize',
          userPreferences: userPreferences || null,
          selection: selectionData,
          theme: theme
        });
      })
      .catch((err) => {
        console.error('Error loading user preferences:', err);
        // Still send initialization message on error with null preferences
        const selection = figma.currentPage.selection;
        const selectionData: { hasNode: boolean; nodeData?: { texSource: string; renderOptions: any; nodeId: string } } = {
          hasNode: false
        };
        this.currentNodeWithData = null;
        
        const theme = ('uiTheme' in figma) ? figma.uiTheme : 'dark';
        
        figma.ui.postMessage({
          type: 'initialize',
          userPreferences: null,
          selection: selectionData,
          theme: theme
        });
      });
  }


  /**
   * Focus viewport on node's bottom-right corner
   */
  private focusViewportOnNodeBottomRight(node: SceneNode): void {
    // Many scene nodes (including GROUP, FRAME, RECTANGLE, etc.) expose width/height.
    // We use the absoluteTransform matrix to compute the absolute coordinates of the
    // node's bottom-right corner and then center the viewport on that point.
    const width = (node as any).width as number | undefined;
    const height = (node as any).height as number | undefined;

    if (width == null || height == null) {
      // Fallback: if we can't read width/height, just scroll as usual.
      figma.viewport.scrollAndZoomIntoView([node]);
      return;
    }

    const t = node.absoluteTransform;
    // Transform local point (width, height) into absolute coordinates:
    // [x', y'] = [m00*width + m01*height + m02, m10*width + m11*height + m12]
    const bottomRightX = t[0][0] * width + t[0][1] * height + t[0][2];
    const bottomRightY = t[1][0] * width + t[1][1] * height + t[1][2];

    figma.viewport.center = { x: bottomRightX, y: bottomRightY };
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const c = hex.replace('#', '');
    if (c.length !== 6) {
      console.warn(`Expected 6-digit hex color with # prefix, got: ${hex}`);
    }
    const num = parseInt(c, 16);
    return { 
      r: ((num >> 16) & 255) / 255, 
      g: ((num >> 8) & 255) / 255, 
      b: (num & 255) / 255 
    };
  }

  /**
   * Create or update a node with SVG
   */
  private createOrUpdateNode(pluginMessage: any): void {
    // Expects normalized data from frontend (all colors include # prefix):
    // - backgroundColor: 6-digit hex with # prefix (e.g., "#FFFFFF")
    // - fontColor: 6-digit hex with # prefix (e.g., "#000000")
    // - tex: TeX source string
    // - svg: SVG markup string
    // - scale: numeric scale factor
    // - fontSize: numeric font size
    // - subExpressionStyles: Array with colors normalized with # prefix
    const margin = 4;
    const bgcolor = pluginMessage.backgroundColor;
    
    // Validate and ensure scale is a valid number
    let scale = pluginMessage.scale;
    if (typeof scale !== 'number' || isNaN(scale) || !isFinite(scale)) {
      // Fallback: calculate scale from fontSize (should always be present)
      const fontSize = pluginMessage.fontSize || DEFAULT_RENDER_OPTIONS.fontSize;
      scale = fontSize / MATHJAX_DEFAULT_FONT_SIZE;
    }
    
    // Check if we should update an existing node
    if (this.currentNodeWithData && pluginMessage.updateExisting) {
      // Update existing node
      if (this.currentNodeWithData.type === 'GROUP') {
        const group = this.currentNodeWithData;
        const children = group.children;
        
        // Find background rectangle and SVG
        let background: RectangleNode | null = null;
        let oldSvg: SceneNode | null = null;
        
        for (const child of children) {
          if (child.type === 'RECTANGLE') {
            background = child;
          } else {
            oldSvg = child;
          }
        }
        
        if (background && oldSvg) {
          // Remove old SVG
          oldSvg.remove();
          
          // Create new SVG
          let svg = figma.createNodeFromSvg(pluginMessage.svg);
          svg.rescale(scale);
          
          // Position new SVG relative to background
          svg.x = background.x + margin;
          svg.y = background.y + margin;
          
          // Update background size and color
          background.resize(svg.width + margin * 2, svg.height + margin * 2);
          background.fills = [{ type: 'SOLID', color: this.hexToRgb(bgcolor) }];
          
          // Add new SVG to group
          group.appendChild(svg);
          
          // Update plugin data
          group.setPluginData("texSource", pluginMessage.tex);
          group.setPluginData("renderOptions", JSON.stringify({
            display: pluginMessage.display !== undefined ? pluginMessage.display : DEFAULT_RENDER_OPTIONS.display,
            fontSize: pluginMessage.fontSize || DEFAULT_RENDER_OPTIONS.fontSize,
            fontColor: pluginMessage.fontColor || DEFAULT_RENDER_OPTIONS.fontColor,
            backgroundColor: pluginMessage.backgroundColor || DEFAULT_RENDER_OPTIONS.backgroundColor,
            subExpressionStyles: (pluginMessage.subExpressionStyles || []).map((style: any) => ({
              expression: style.expression || '',
              color: style.color || '#000000',
              occurrences: style.occurrences
            }))
          }));
          
          group.name = pluginMessage.tex;
          
          // Don't recenter viewport when updating existing node
          return;
        }
      }
    }
    
    // Create new node
    const nodes: SceneNode[] = [];
    const background = figma.createRectangle();
    let svg = figma.createNodeFromSvg(pluginMessage.svg);
    svg.rescale(scale);

    // Center the frame in our current viewport so we can see it.
    svg.x = figma.viewport.center.x - svg.width / 2;
    svg.y = figma.viewport.center.y - svg.height / 2;

    background.fills = [{ type: 'SOLID', color: this.hexToRgb(bgcolor) }];

    // Create the background rectangle, make it bigger than the SVG by the margin amount
    background.resize(svg.width + margin * 2, svg.height + margin * 2);

    background.x = figma.viewport.center.x - background.width / 2;
    background.y = figma.viewport.center.y - background.height / 2;

    nodes.push(background, svg);

    const group = figma.group(nodes, figma.currentPage);
    group.name = pluginMessage.tex;

    // Store plugin data on the group
    group.setPluginData("texSource", pluginMessage.tex);
    group.setPluginData("renderOptions", JSON.stringify({
      display: pluginMessage.display !== undefined ? pluginMessage.display : DEFAULT_RENDER_OPTIONS.display,
      fontSize: pluginMessage.fontSize || DEFAULT_RENDER_OPTIONS.fontSize,
      fontColor: pluginMessage.fontColor || DEFAULT_RENDER_OPTIONS.fontColor,
      backgroundColor: pluginMessage.backgroundColor || DEFAULT_RENDER_OPTIONS.backgroundColor,
      subExpressionStyles: (pluginMessage.subExpressionStyles || []).map((style: any) => ({
        expression: style.expression || '',
        color: style.color || '#000000',
        occurrences: style.occurrences
      }))
    }));

    // Update tracked node
    this.currentNodeWithData = group;

    figma.currentPage.selection = [group];

    // Scroll and zoom to ensure element is visible, then adjust viewport to position at bottom-right
    figma.viewport.scrollAndZoomIntoView([group]);
    
    // After scrollAndZoomIntoView, adjust viewport so element is visible
    const shiftX = background.width / 2;
    const shiftY = 0;
    
    figma.viewport.center = {
      x: figma.viewport.center.x + shiftX,
      y: figma.viewport.center.y + shiftY
    };
  }

  /**
   * Check selected nodes and load plugin data
   */
  private checkSelectionAndLoadData(): void {
    const selection = figma.currentPage.selection;
    if (selection.length === 1) {
      let node: SceneNode | null = selection[0];
      
      // Check the node and its parents for plugin data
      while (node) {
        const texSource = node.getPluginData("texSource");
        const renderOptionsStr = node.getPluginData("renderOptions");
        
        if (texSource && renderOptionsStr) {
          try {
            const renderOptions = JSON.parse(renderOptionsStr);
            // Track this node as the current node with data
            this.currentNodeWithData = node;
            figma.ui.postMessage({
              type: 'loadNodeData',
              texSource,
              renderOptions,
              nodeId: node.id
            });
            return; // Found data, stop searching
          } catch (err) {
            console.error('Error parsing renderOptions:', err);
          }
        }
        
        // Check parent if available (only SceneNode types, not PAGE or DOCUMENT)
        if ('parent' in node && node.parent) {
          const parent = node.parent;
          if (parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
            node = parent as SceneNode;
          } else {
            node = null;
          }
        } else {
          node = null;
        }
      }
    }
    
    // No node with plugin data found
    this.currentNodeWithData = null;
    figma.ui.postMessage({ type: 'clearNodeData' });
  }
}

// Initialize the plugin backend
new PluginBackend().initialize().catch(console.error);
