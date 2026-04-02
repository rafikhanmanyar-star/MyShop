/**
 * Fails if disallowed typography patterns appear in UI source (run in CI).
 * Usage: node scripts/check-typography.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');

const BAD = [
  [/text-\[\d+px\]/, 'Arbitrary text-[Npx] — use text-xs / text-sm / design tokens'],
  [/text-\[\d+\.\d+rem\]/, 'Arbitrary rem text sizes — use Tailwind scale'],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(p);
  }
  return out;
}

const errors = [];
for (const file of walk(srcRoot)) {
  const rel = path.relative(path.join(__dirname, '..'), file);
  const s = fs.readFileSync(file, 'utf8');
  for (const [re, msg] of BAD) {
    if (re.test(s)) {
      const lines = s.split('\n');
      lines.forEach((line, i) => {
        if (re.test(line)) errors.push(`${rel}:${i + 1}: ${msg}`);
      });
    }
  }
}

if (errors.length) {
  console.error('Typography check failed:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Typography check OK.');
