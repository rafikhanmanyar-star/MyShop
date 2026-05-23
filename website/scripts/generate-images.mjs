/**
 * Generates compressed WebP mockup images from SVG templates.
 * Run: npm run generate:images
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../public/images');
const publicDir = path.join(__dirname, '../public');
const iconSvg = path.join(publicDir, 'icons/icon-512.svg');

const brand = '#DC2626';
const brandGreen = '#1F7A63';
const accent = '#F59E0B';
const dark = '#1E293B';
const muted = '#64748B';
const bg = '#FFFFFF';

function phoneMockupSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1440" viewBox="0 0 720 1440">
  <rect width="720" height="1440" fill="${bg}"/>
  <rect x="40" y="40" width="640" height="1360" rx="56" fill="${dark}"/>
  <rect x="56" y="96" width="608" height="1280" rx="44" fill="#fff"/>
  <rect x="56" y="96" width="608" height="120" fill="${brand}"/>
  <text x="96" y="168" fill="#fff" font-family="Arial,sans-serif" font-size="32" font-weight="700">oBo Store</text>
  <text x="96" y="210" fill="#E2E8F0" font-family="Arial,sans-serif" font-size="20">FMC B-17 Kohsar Plaza</text>
  <rect x="96" y="240" width="528" height="56" rx="28" fill="rgba(255,255,255,0.2)"/>
  <text x="128" y="276" fill="#CBD5E1" font-family="Arial,sans-serif" font-size="22">Search groceries...</text>
  <rect x="96" y="320" width="528" height="88" rx="20" fill="${accent}"/>
  <text x="120" y="360" fill="#fff" font-family="Arial,sans-serif" font-size="22">Special Offer</text>
  <text x="120" y="392" fill="#fff" font-family="Arial,sans-serif" font-size="30" font-weight="700">Up to 40% OFF</text>
  <rect x="96" y="440" width="120" height="48" rx="24" fill="${brand}"/>
  <text x="120" y="472" fill="#fff" font-family="Arial,sans-serif" font-size="20">Snacks</text>
  <rect x="232" y="440" width="100" height="48" rx="24" fill="#E2E8F0"/>
  <text x="252" y="472" fill="${muted}" font-family="Arial,sans-serif" font-size="20">Dairy</text>
  <rect x="96" y="520" width="248" height="220" rx="20" fill="#DBEAFE"/>
  <text x="120" y="680" fill="${dark}" font-family="Arial,sans-serif" font-size="22">Fresh Milk 1L</text>
  <text x="120" y="712" fill="${brand}" font-family="Arial,sans-serif" font-size="24" font-weight="700">Rs. 280</text>
  <rect x="376" y="520" width="248" height="220" rx="20" fill="#FFEDD5"/>
  <text x="400" y="680" fill="${dark}" font-family="Arial,sans-serif" font-size="22">Potato Chips</text>
  <text x="400" y="712" fill="${brand}" font-family="Arial,sans-serif" font-size="24" font-weight="700">Rs. 150</text>
  <rect x="96" y="760" width="248" height="220" rx="20" fill="#FEF9C3"/>
  <text x="120" y="920" fill="${dark}" font-family="Arial,sans-serif" font-size="22">Orange Juice</text>
  <rect x="376" y="760" width="248" height="220" rx="20" fill="#EDE9FE"/>
  <text x="400" y="920" fill="${dark}" font-family="Arial,sans-serif" font-size="22">Detergent 2kg</text>
</svg>`;
}

function trackingSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320" viewBox="0 0 560 320">
  <rect width="560" height="320" rx="24" fill="#fff"/>
  <rect width="560" height="320" rx="24" fill="none" stroke="#E2E8F0" stroke-width="4"/>
  <text x="32" y="56" fill="${dark}" font-family="Arial,sans-serif" font-size="28" font-weight="700">Live order tracking</text>
  <circle cx="80" cy="160" r="16" fill="${brand}"/>
  <line x1="96" y1="160" x2="200" y2="160" stroke="${brand}" stroke-width="6"/>
  <circle cx="216" cy="160" r="16" fill="${brand}"/>
  <line x1="232" y1="160" x2="360" y2="160" stroke="#CBD5E1" stroke-width="6" stroke-dasharray="12 8"/>
  <circle cx="376" cy="160" r="16" fill="#CBD5E1"/>
  <text x="32" y="220" fill="${muted}" font-family="Arial,sans-serif" font-size="22">Rider is 15 minutes away</text>
  <rect x="32" y="248" width="496" height="16" rx="8" fill="#E2E8F0"/>
  <rect x="32" y="248" width="360" height="16" rx="8" fill="${brand}"/>
</svg>`;
}

function storefrontSvg(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#CBD5E1"/><stop offset="100%" stop-color="#94A3B8"/></linearGradient></defs>
  <rect width="1280" height="800" fill="url(#sky)"/>
  <rect x="320" y="280" width="640" height="360" fill="#E2E8F0"/>
  <rect x="360" y="200" width="560" height="80" fill="${brand}"/>
  <rect x="480" y="360" width="120" height="200" fill="#fff" opacity="0.5"/>
  <rect x="680" y="360" width="120" height="200" fill="#fff" opacity="0.5"/>
  <rect x="420" y="120" width="440" height="100" rx="8" fill="${brand}"/>
  <text x="640" y="190" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="40" font-weight="700">${label}</text>
  <text x="640" y="720" text-anchor="middle" fill="${dark}" font-family="Arial,sans-serif" font-size="32">Main Boulevard, Islamabad</text>
</svg>`;
}

function deliverySvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <rect width="1280" height="800" fill="${bg}"/>
  <rect x="120" y="200" width="480" height="400" rx="24" fill="#fff" stroke="#E2E8F0" stroke-width="4"/>
  <rect x="160" y="260" width="160" height="120" rx="12" fill="#DBEAFE"/>
  <rect x="340" y="260" width="160" height="120" rx="12" fill="#FFEDD5"/>
  <rect x="160" y="400" width="160" height="120" rx="12" fill="#EDE9FE"/>
  <text x="160" y="560" fill="${dark}" font-family="Arial,sans-serif" font-size="28" font-weight="700">Household essentials</text>
  <rect x="680" y="280" width="480" height="280" rx="24" fill="${brand}"/>
  <text x="720" y="380" fill="#fff" font-family="Arial,sans-serif" font-size="36" font-weight="700">Local delivery</text>
  <text x="720" y="430" fill="#FECACA" font-family="Arial,sans-serif" font-size="26">B-17 Islamabad</text>
  <polygon points="900,520 980,480 1060,520 980,560" fill="${accent}"/>
</svg>`;
}

function budgetSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
  <rect width="960" height="640" rx="24" fill="${dark}"/>
  <text x="48" y="80" fill="#fff" font-family="Arial,sans-serif" font-size="36" font-weight="700">Budget Planner</text>
  <rect x="48" y="120" width="864" height="200" rx="20" fill="rgba(255,255,255,0.08)"/>
  <text x="80" y="180" fill="#94A3B8" font-family="Arial,sans-serif" font-size="24">Monthly grocery budget</text>
  <text x="80" y="260" fill="#fff" font-family="Arial,sans-serif" font-size="56" font-weight="700">Rs. 25,000</text>
  <rect x="48" y="360" width="864" height="24" rx="12" fill="rgba(255,255,255,0.15)"/>
  <rect x="48" y="360" width="520" height="24" rx="12" fill="${brand}"/>
  <text x="80" y="450" fill="#94A3B8" font-family="Arial,sans-serif" font-size="22">Spent Rs. 15,200 · 61% used</text>
</svg>`;
}

function installSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="560" viewBox="0 0 640 560">
  <rect width="640" height="560" rx="24" fill="#fff"/>
  <rect width="640" height="560" rx="24" fill="none" stroke="#E2E8F0" stroke-width="4"/>
  <rect x="40" y="40" width="560" height="48" rx="8" fill="#F1F5F9"/>
  <circle cx="68" cy="64" r="10" fill="#F87171"/>
  <circle cx="100" cy="64" r="10" fill="#FBBF24"/>
  <circle cx="132" cy="64" r="10" fill="#34D399"/>
  <rect x="80" y="140" width="480" height="280" rx="20" fill="${bg}" stroke="#E2E8F0" stroke-width="3"/>
  <text x="120" y="220" fill="${dark}" font-family="Arial,sans-serif" font-size="32" font-weight="700">Add to Home Screen</text>
  <text x="120" y="270" fill="${muted}" font-family="Arial,sans-serif" font-size="24">Install oBo Store PWA</text>
  <rect x="120" y="320" width="140" height="56" rx="12" fill="#E2E8F0"/>
  <text x="150" y="356" fill="${muted}" font-family="Arial,sans-serif" font-size="22">Cancel</text>
  <rect x="280" y="320" width="160" height="56" rx="12" fill="${brand}"/>
  <text x="310" y="356" fill="#fff" font-family="Arial,sans-serif" font-size="22" font-weight="700">Install</text>
</svg>`;
}

const assets = [
  { file: 'hero-pwa-ordering.webp', svg: phoneMockupSvg(), width: 720, height: 1440 },
  { file: 'tracking-feature.webp', svg: trackingSvg(), width: 560, height: 320 },
  { file: 'store-fmc-b17.webp', svg: storefrontSvg('oBo Store · FMC B-17'), width: 1280, height: 800 },
  { file: 'household-delivery.webp', svg: deliverySvg(), width: 1280, height: 800 },
  { file: 'budget-planner.webp', svg: budgetSvg(), width: 960, height: 640 },
  { file: 'pwa-install.webp', svg: installSvg(), width: 640, height: 560 },
  { file: 'shop-kohsar-plaza.webp', svg: storefrontSvg('Kohsar Plaza'), width: 1280, height: 800 },
];

await mkdir(outDir, { recursive: true });

const iconBuffer = await sharp(iconSvg).resize(512, 512).png({ quality: 90 }).toBuffer();

await sharp(iconBuffer).toFile(path.join(publicDir, 'logo.png'));
console.log('Created logo.png');

const faviconSizes = [
  { file: 'favicon-16x16.png', size: 16 },
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'android-chrome-192x192.png', size: 192 },
  { file: 'android-chrome-512x512.png', size: 512 },
  { file: 'mstile-70x70.png', size: 70 },
  { file: 'mstile-150x150.png', size: 150 },
  { file: 'mstile-310x310.png', size: 310 },
];

for (const { file, size } of faviconSizes) {
  await sharp(iconBuffer).resize(size, size).png({ quality: 90 }).toFile(path.join(publicDir, file));
  console.log(`Created ${file}`);
}

await sharp(iconBuffer)
  .resize(310, 150, { fit: 'contain', background: { r: 31, g: 122, b: 99, alpha: 1 } })
  .png({ quality: 90 })
  .toFile(path.join(publicDir, 'mstile-310x150.png'));
console.log('Created mstile-310x150.png');

await sharp(iconBuffer).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.ico'));
console.log('Created favicon.ico');

const heroPngPath = path.join(outDir, 'hero-app-mockup-red.png');
await sharp(Buffer.from(phoneMockupSvg()))
  .resize(909, 755, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png({ quality: 90 })
  .toFile(heroPngPath);
console.log('Created hero-app-mockup-red.png');

for (const asset of assets) {
  const outPath = path.join(outDir, asset.file);
  await sharp(Buffer.from(asset.svg))
    .resize(asset.width, asset.height)
    .webp({ quality: 82, effort: 6 })
    .toFile(outPath);
  console.log(`Created ${asset.file}`);
}

console.log('Done — WebP images written to public/images/');
