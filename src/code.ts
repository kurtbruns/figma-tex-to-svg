figma.showUI(__html__)

figma.ui.resize(420, 540);

// Send theme to UI on load
if ('uiTheme' in figma) {
  console.log('uiTheme', figma.uiTheme);
  figma.ui.postMessage({ theme: figma.uiTheme });
}

figma.ui.onmessage = (pluginMessage) => {

  const margin = 4;
  const nodes: SceneNode [] = [];
  const background = figma.createRectangle();
  let svg = figma.createNodeFromSvg(pluginMessage.svg);
  svg.rescale(pluginMessage.scale);

  // Center the frame in our current viewport so we can see it.
  svg.x = figma.viewport.center.x - svg.width / 2;
  svg.y = figma.viewport.center.y - svg.height / 2

  const bgcolor = pluginMessage.bgcolor;
  function hexToRgb(hex: string) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    const num = parseInt(c, 16);
    return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255 };
  }
  background.fills = [{ type: 'SOLID', color: hexToRgb(bgcolor) }];

  // Create the background rectangle, make it bigger than the SVG by the margin amount
  background.resize(svg.width + margin * 2, svg.height + margin * 2);

  background.x = figma.viewport.center.x - background.width / 2;
  background.y = figma.viewport.center.y - background.height / 2

  nodes.push(background, svg)

  const group = figma.group(nodes, figma.currentPage);
  group.name = pluginMessage.tex;

  figma.currentPage.selection = [group];

  figma.viewport.scrollAndZoomIntoView([group]);
  // figma.viewport.scrollAndZoomIntoView(nodes)
}

