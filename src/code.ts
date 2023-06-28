figma.showUI(__html__)

figma.ui.resize(360, 360);

figma.ui.onmessage = (pluginMessage) => {

  const nodes: SceneNode [] = [];
  let svg = figma.createNodeFromSvg(pluginMessage.svg);
  svg.rescale(1.5);
  svg.name = pluginMessage.tex;

  // Center the frame in our current viewport so we can see it.
  svg.x = figma.viewport.center.x - svg.width / 2;
  svg.y = figma.viewport.center.y - svg.height / 2
  nodes.push(svg)

  figma.currentPage.selection = nodes;
  figma.currentPage.appendChild(svg)
  // figma.viewport.scrollAndZoomIntoView(nodes)
}

