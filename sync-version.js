// sync-version.js
const pkg = require('./package.json');
const manifest = require('./manifest.json');
const fs = require('fs');
const { execSync } = require('child_process');

manifest.version = pkg.version;

fs.writeFileSync(
  './manifest.json',
  JSON.stringify(manifest, null, 2) + '\n'
);

// Stage manifest.json so it's included in the npm version commit
execSync('git add manifest.json', { stdio: 'inherit' });

