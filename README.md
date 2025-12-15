
Figma plugin to render TeX as SVG and embed it in a Figma Design Document.

## Development

To install the dependencies run this command.

```
npm install
```

To rebuild the changes made to `src/code.ts` run this command.

```
npm run watch
```

Changes to the `src/code.ts` file will be automatically rebuilt and the plugin will be updated. Changes to the `ui.html` file will not be automatically rebuilt. You can use the “Reload Plugins” command in Figma to reload the plugin.

```
⌘ + ⌥ + P
```

The `ui.html` file is the UI for the plugin. It is used to display the TeX input and the rendered SVG.
