
Figma plugin to render TeX as SVG and embed it in a Figma Design Document.

## Development

To install the dependencies run this command.

```
npm install
```

To automatically rebuild the plugin when changes are made to `src`, run this command.

```
npm run watch
```

## Publishing

When developing a new feature, follow these steps:

### Development Workflow

1. **Make your changes** to the source files in `src/`
2. **Test locally** using `npm run watch` and reload the plugin in Figma (`⌘ + ⌥ + P`)
3. **Verify** that all functionality works as expected

### Versioning

Before publishing, increment the plugin version number:

1. **Update the version** in `package.json`:
   - For bug fixes: increment the patch version (e.g., `1.0.1` → `1.0.2`)
   - For new features: increment the minor version (e.g., `1.0.1` → `1.1.0`)
   - For breaking changes: increment the major version (e.g., `1.0.1` → `2.0.0`)

   You can edit `package.json` directly or use npm:
   ```bash
   npm version patch   # for bug fixes (1.0.1 → 1.0.2)
   npm version minor   # for new features (1.0.1 → 1.1.0)
   npm version major   # for breaking changes (1.0.1 → 2.0.0)
   ```

### Building for Production

Build the production bundle:

```bash
npm run build
```

This will automatically sync the version from `package.json` to `manifest.json` and create optimized files in the `dist/` directory that will be published to Figma.

### Publishing to Figma

1. **Open Figma Desktop** (publishing is only available in the desktop app, not the web version)
2. **Open your plugin** in development mode
3. **Go to** `Plugins` → `Development` → `Your Plugin Name`
4. **Click** the `...` menu next to your plugin
5. **Select** `Publish` or `Publish new version`
6. **Fill in** the version details:
   - Version number (should match the version in `package.json` and `manifest.json`)
   - Release notes describing the changes
7. **Click** `Publish`

The new version will be available to users after Figma reviews and approves it (if required for your plugin).
