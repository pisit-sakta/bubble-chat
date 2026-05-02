// Generate PWA icons from a single SVG source.
// Run via: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('public', { recursive: true });

const svg = (size, padded = false) => {
  const r = padded ? size * 0.36 : size * 0.5;
  const cx = size / 2, cy = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <radialGradient id="g" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stop-color="#3a3a3a"/>
        <stop offset="100%" stop-color="#171717"/>
      </radialGradient>
      <radialGradient id="b" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffd5c2" stop-opacity="0.95"/>
        <stop offset="40%" stop-color="#d97757" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#9c4a30" stop-opacity="0.95"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#g)" rx="${size * 0.22}" ry="${size * 0.22}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#b)" />
    <circle cx="${cx - size * 0.12}" cy="${cy - size * 0.12}" r="${size * 0.08}" fill="white" fill-opacity="0.45" />
  </svg>`;
};

async function gen(size, name, padded = false) {
  const buf = Buffer.from(svg(size, padded));
  await sharp(buf).png().toFile(`public/${name}`);
  console.log('wrote', `public/${name}`);
}

await gen(192, 'icon-192.png');
await gen(512, 'icon-512.png');
await gen(512, 'icon-512-mask.png', true);
await gen(180, 'apple-touch-icon.png');

writeFileSync('public/favicon.svg', svg(64));
console.log('wrote public/favicon.svg');
