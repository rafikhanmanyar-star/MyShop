/**
 * One-off helper: replace arbitrary font-size classes with design-system scale.
 * Run: node scripts/apply-typography-scale.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(p);
  }
  return out;
}

const replacements = [
  [/text-\[9px\]/g, 'text-xs'],
  [/text-\[10px\]/g, 'text-xs'],
  [/text-\[11px\]/g, 'text-xs'],
  [/text-\[12px\]/g, 'text-xs'],
  [/text-\[7px\]/g, 'text-xs'],
  [/text-\[8px\]/g, 'text-xs'],
  [/text-\[1\.0125rem\]/g, 'text-lg'],
  [/text-\[0\.7875rem\]/g, 'text-sm'],
  [/text-\[0\.675rem\]/g, 'text-xs'],
  [/text-\[10px\] md:text-\[11px\]/g, 'text-xs md:text-xs'],
];

let changed = 0;
for (const file of walk(srcRoot)) {
  let s = fs.readFileSync(file, 'utf8');
  let next = s;
  for (const [re, rep] of replacements) {
    next = next.replace(re, rep);
  }
  if (next !== s) {
    fs.writeFileSync(file, next, 'utf8');
    changed++;
  }
}
console.log(`Updated ${changed} files.`);
