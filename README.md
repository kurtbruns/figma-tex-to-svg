# MathTeX Editor

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

2. **Update the version number**: Since Figma uses whole number versioning (5, 6, 7, etc.), increment the major version number each time you publish. The `npm version major` command will update `package.json` and create a git commit with the version change.
   ```bash
   npm version major   # increments version (5 → 6, 6 → 7, etc.)
   ```

   This will update `package.json` and create a git commit with the version change. If needed, you can also use `npm version patch` or `npm version minor` to increment the version number for bug fixes before publishing the new version to Figma.

3. **Push changes to the repository**: Push your commits and tags to the remote repository.
   ```bash
   git push origin main --follow-tags
   ```

### Building for Production

Build the production bundle:

```bash
npm run build
```

This creates optimized files in the `dist/` directory that will be published to Figma.

### Publishing to Figma

After committing changes, updating the version, and building, publish to Figma:

1. **Open Figma Desktop** (publishing is only available in the desktop app, not the web version)
2. **Open your plugin** in development mode
3. **Go to** `Plugins` → `Development` → `Mange Plugins in Development`
4. **Select** `Publish new version`
5. **Fill in** any updated details.
6. **Click** `Publish`
