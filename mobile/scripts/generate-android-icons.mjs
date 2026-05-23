/**
 * Generate Android launcher icons from mobile/assets/obo-app-icon-source.png
 * Run: npm run generate-android-icons
 */
import sharp from 'sharp';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const source = join(__dirname, '../assets/obo-app-icon-source.png');
const resDir = join(repoRoot, 'android/app/src/main/res');

if (!existsSync(source)) {
  console.error('Missing source:', source);
  process.exit(1);
}

/** Launcher PNG sizes (px) per density */
const LAUNCHER = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

/** Adaptive icon foreground (108dp base × density) */
const FOREGROUND = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function renderIcon(size) {
  return sharp(source)
    .resize(size, size, { fit: 'contain', background: WHITE })
    .png()
    .toBuffer();
}

for (const [folder, size] of Object.entries(LAUNCHER)) {
  const dir = join(resDir, folder);
  const buf = await renderIcon(size);
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await sharp(buf).toFile(join(dir, name));
    console.log('Wrote', join(folder, name), `${size}x${size}`);
  }
}

for (const [folder, size] of Object.entries(FOREGROUND)) {
  const path = join(resDir, folder, 'ic_launcher_foreground.png');
  await sharp(await renderIcon(size)).toFile(path);
  console.log('Wrote', join(folder, 'ic_launcher_foreground.png'), `${size}x${size}`);
}

console.log('Done. Rebuild the Android app to see the new icon.');
