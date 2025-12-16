
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

### Versioning and Git

Before publishing, follow these steps:

1. **Commit changes in Git**: Commit your changes to the codebase first. This provides a reference point for the changes you made.
   ```bash
   git add .
   git commit -m "Your commit message"
   ```

2. **Update the version number**: Update the version number after committing changes. This ensures the new version corresponds to the committed changes. The `npm version` command also creates a new Git tag for the new version.
   ```bash
   npm version patch   # for bug fixes (1.0.1 → 1.0.2)
   npm version minor   # for new features (1.0.1 → 1.1.0)
   npm version major   # for breaking changes (1.0.1 → 2.0.0)
   ```

3. **Push changes to the repository**: Push your commits and tags to the remote repository.
   ```bash
   git push origin main --follow-tags
   ```

### Building for Production

Build the production bundle:

```bash
npm run build
```

This will automatically sync the version from `package.json` to `manifest.json` and create optimized files in the `dist/` directory that will be published to Figma.

### Publishing to Figma

After committing changes, updating the version, and building, publish to Figma:

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
