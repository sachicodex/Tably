const fs = require('fs');
const path = './manifest.json';

const manifest = JSON.parse(fs.readFileSync(path));
const [major, minor, patch] = manifest.version.split('.').map(Number);

// Increment patch version
manifest.version = `${major}.${minor}.${patch + 1}`;

fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
console.log(`Version bumped to ${manifest.version}`);
