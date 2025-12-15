figma.showUI(__html__)

figma.ui.resize(420, 540);

// Load and send saved config to UI
async function loadAndSendConfig() {
  try {
    const config = await figma.clientStorage.getAsync('config');
    if (config) {
      figma.ui.postMessage({ type: 'loadConfig', config });
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

// Send theme to UI on load
if ('uiTheme' in figma) {
  console.log('uiTheme', figma.uiTheme);
  figma.ui.postMessage({ theme: figma.uiTheme });
}

// Load saved config on initialization
loadAndSendConfig();

// Track the currently selected node that has plugin data
let currentNodeWithData: SceneNode | null = null;

figma.ui.onmessage = async (pluginMessage) => {
  // Backend responsibilities:
  // - Handle Figma API operations (create/update nodes, manage selection)
  // - Convert normalized data to Figma formats (hex to RGB)
  // - Store/retrieve plugin data
  // Frontend responsibilities (ui.html):
  // - UI rendering and user interaction
  // - Color normalization and validation
  // - Data preparation and formatting before sending to backend

  // Handle config save
  if (pluginMessage.type === 'saveConfig') {
    try {
      await figma.clientStorage.setAsync('config', {
        display: pluginMessage.display,
        bgcolor: pluginMessage.bgcolor,
        fontcolor: pluginMessage.fontcolor,
        fontsize: pluginMessage.fontsize,
      });
    } catch (err) {
      console.error('Error saving config:', err);
    }
    return;
  }

  // Handle locate node request
  if (pluginMessage.type === 'locateNode') {
    if (currentNodeWithData) {
      figma.currentPage.selection = [currentNodeWithData];
      figma.viewport.scrollAndZoomIntoView([currentNodeWithData]);
    }
    return;
  }

  // Helper function to convert normalized hex color to RGB
  // Expects a 6-digit hex color (with or without # prefix)
  // Color normalization should be handled by the frontend
  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const c = hex.replace('#', '');
    if (c.length !== 6) {
      console.warn(`Expected 6-digit hex color, got: ${hex}`);
    }
    const num = parseInt(c, 16);
    return { 
      r: ((num >> 16) & 255) / 255, 
      g: ((num >> 8) & 255) / 255, 
      b: (num & 255) / 255 
    };
  }

  // Handle SVG placement or update
  // Expects normalized data from frontend:
  // - bgcolor: 6-digit hex with # prefix (e.g., "#FFFFFF")
  // - fontcolor: 6-digit hex with # prefix (e.g., "#000000")
  // - tex: TeX source string
  // - svg: SVG markup string
  // - scale: numeric scale factor
  // - fontsize: numeric font size
  const margin = 4;
  const bgcolor = pluginMessage.bgcolor; // Already normalized by frontend
  
  // Check if we should update an existing node
  if (currentNodeWithData && pluginMessage.updateExisting) {
    // Update existing node
    if (currentNodeWithData.type === 'GROUP') {
      const group = currentNodeWithData;
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
        svg.rescale(pluginMessage.scale);
        
        // Position new SVG relative to background
        svg.x = background.x + margin;
        svg.y = background.y + margin;
        
        // Update background size and color
        background.resize(svg.width + margin * 2, svg.height + margin * 2);
        background.fills = [{ type: 'SOLID', color: hexToRgb(bgcolor) }];
        
        // Add new SVG to group
        group.appendChild(svg);
        
        // Update plugin data
        group.setPluginData("texSource", pluginMessage.tex);
        group.setPluginData("renderOptions", JSON.stringify({
          fontSize: pluginMessage.fontsize || 16,
          fontColor: pluginMessage.fontcolor || "#000000",
          backgroundColor: pluginMessage.bgcolor || "#FFFFFF"
        }));
        
        group.name = pluginMessage.tex;
        
        // Don't recenter viewport when updating existing node
        return;
      }
    }
  }
  
  // Create new node
  const nodes: SceneNode [] = [];
  const background = figma.createRectangle();
  let svg = figma.createNodeFromSvg(pluginMessage.svg);
  svg.rescale(pluginMessage.scale);

  // Center the frame in our current viewport so we can see it.
  svg.x = figma.viewport.center.x - svg.width / 2;
  svg.y = figma.viewport.center.y - svg.height / 2

  background.fills = [{ type: 'SOLID', color: hexToRgb(bgcolor) }];

  // Create the background rectangle, make it bigger than the SVG by the margin amount
  background.resize(svg.width + margin * 2, svg.height + margin * 2);

  background.x = figma.viewport.center.x - background.width / 2;
  background.y = figma.viewport.center.y - background.height / 2

  nodes.push(background, svg)

  const group = figma.group(nodes, figma.currentPage);
  group.name = pluginMessage.tex;

  // Store plugin data on the group
  group.setPluginData("texSource", pluginMessage.tex);
  group.setPluginData("renderOptions", JSON.stringify({
    fontSize: pluginMessage.fontsize || 16,
    fontColor: pluginMessage.fontcolor || "#000000",
    backgroundColor: pluginMessage.bgcolor || "#FFFFFF"
  }));

  // Update tracked node
  currentNodeWithData = group;

  figma.currentPage.selection = [group];

  figma.viewport.scrollAndZoomIntoView([group]);
  // figma.viewport.scrollAndZoomIntoView(nodes)
}

// Function to check selected nodes and load plugin data
function checkSelectionAndLoadData() {
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
          currentNodeWithData = node;
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
  currentNodeWithData = null;
  figma.ui.postMessage({ type: 'clearNodeData' });
}

// Listen for selection changes
figma.on('selectionchange', () => {
  // Clear tracked node if selection is empty
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    currentNodeWithData = null;
    figma.ui.postMessage({ type: 'clearNodeData' });
  } else {
    checkSelectionAndLoadData();
  }
});

// Check selection on initial load
checkSelectionAndLoadData();

