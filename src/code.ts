figma.showUI(__html__)

figma.ui.resize(360, 360);

figma.ui.onmessage = (pluginMessage) => {

  const nodes: SceneNode [] = [];
  let svg = figma.createNodeFromSvg(pluginMessage.svg);
  svg.rescale(1.5);
  svg.name = pluginMessage.tex;
  nodes.push(svg)

  figma.currentPage.selection = nodes;
  figma.currentPage.appendChild(svg)
  figma.viewport.scrollAndZoomIntoView(nodes)
}

