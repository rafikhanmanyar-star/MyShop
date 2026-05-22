/**
 * Generate Android launcher icons from mobile/assets/obo-app-icon-source.png
 * Run: node scripts/generate-android-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
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

const input = readFileSync(source);

for (const [folder, size] of Object.entries(LAUNCHER)) {
  const dir = join(resDir, folder);
  const buf = await sharp(input).resize(size, size, { fit: 'cover' }).png().toBuffer();
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await sharp(buf).toFile(join(dir, name));
    console.log('Wrote', join(folder, name), `${size}x${size}`);
  }
}

for (const [folder, size] of Object.entries(FOREGROUND)) {
  const path = join(resDir, folder, 'ic_launcher_foreground.png');
  await sharp(input).resize(size, size, { fit: 'cover' }).png().toFile(path);
  console.log('Wrote', join(folder, 'ic_launcher_foreground.png'), `${size}x${size}`);
}

console.log('Done. Rebuild the Android app to see the new icon.');
