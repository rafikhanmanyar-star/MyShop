/**
 * Regenerates PNG icons from public/icons/apple-touch-icon.svg for iOS and manifest.
 * Run from mobile/: npm run generate-icons
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../public/icons');
const svgPath = join(iconsDir, 'apple-touch-icon.svg');
const svg = readFileSync(svgPath);

const out = [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
];

for (const [name, size] of out) {
    await sharp(svg).resize(size, size).png().toFile(join(iconsDir, name));
    console.log(`Wrote ${name} (${size}×${size})`);
}
