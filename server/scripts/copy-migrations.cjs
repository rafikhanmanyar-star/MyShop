const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'migrations');
const dst = path.join(__dirname, '..', 'dist', 'migrations');
fs.mkdirSync(dst, { recursive: true });
fs.readdirSync(src)
  .filter(f => f.endsWith('.sql'))
  .forEach(f => fs.copyFileSync(path.join(src, f), path.join(dst, f)));
console.log('Copied migration files to dist/migrations/');