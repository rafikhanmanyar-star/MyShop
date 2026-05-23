/**
 * Regenerates PWA / iOS home-screen PNG icons from mobile/assets/obo-app-icon-source.png.
 * Run from mobile/: npm run generate-icons
 */
import sharp from 'sharp';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = join(__dirname, '../assets/obo-app-icon-source.png');
const iconsDir = join(__dirname, '../public/icons');

if (!existsSync(source)) {
  console.error('Missing source:', source);
  process.exit(1);
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function renderIcon(size) {
  return sharp(source)
    .resize(size, size, { fit: 'contain', background: WHITE })
    .png()
    .toBuffer();
}

const out = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['shop-logo.png', 512],
];

for (const [name, size] of out) {
  await sharp(await renderIcon(size)).toFile(join(iconsDir, name));
  console.log(`Wrote ${name} (${size}×${size})`);
}
