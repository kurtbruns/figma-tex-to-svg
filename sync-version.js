// sync-version.js
const pkg = require('./package.json');
const manifest = require('./manifest.json');

manifest.version = pkg.version;

require('fs').writeFileSync(
  './manifest.json',
  JSON.stringify(manifest, null, 2) + '\n'
);

