figma.showUI(__html__)

figma.ui.resize(360, 360);

figma.ui.onmessage = (pluginMessage) => {
  figma.createNodeFromSvg(pluginMessage.svg).rescale(1.5)
}

