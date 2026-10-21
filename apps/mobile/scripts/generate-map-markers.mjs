// Regenerate bundled native marker textures: node apps/mobile/scripts/generate-map-markers.mjs
// No runtime drawing or font loading is needed for map icons.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const directory = new URL('../assets/map-markers/', import.meta.url);
const rust = [163, 62, 39, 255];
const teal = [15, 118, 110, 255];
const paper = [255, 253, 249, 255];
const border = [245, 214, 206, 255];
const tealBorder = [166, 218, 211, 255];
const transparent = [0, 0, 0, 0];
const variants = [
  ...[8, 12, 16, 20].map((diameter) => ({ name: `dot-${diameter}`, diameter })),
  ...[8, 12, 16, 20].map((diameter) => ({
    name: `wishlist-dot-${diameter}`,
    diameter,
    wishlist: true,
  })),
  ...['heart', 'bookmark', 'compass'].flatMap((symbol) =>
    [24, 30].map((diameter) => ({ name: `${symbol}-${diameter}`, diameter, symbol })),
  ),
  ...['heart', 'bookmark', 'compass'].map((symbol) => ({
    name: `${symbol}-selected`,
    diameter: 30,
    symbol,
    selected: true,
  })),
];

function symbolContains(symbol, x, y, diameter) {
  if (symbol === 'heart') {
    const hx = x / (diameter * 0.22);
    const hy = -y / (diameter * 0.22) + 0.1;
    return (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3 <= 0;
  }
  if (symbol === 'bookmark') {
    const halfWidth = diameter * 0.14;
    const halfHeight = diameter * 0.24;
    return (
      Math.abs(x) <= halfWidth &&
      y >= -halfHeight &&
      y <= halfHeight - (1 - Math.abs(x) / halfWidth) * diameter * 0.12
    );
  }
  // A compass needle: a diamond with its north-east half filled.
  return Math.abs((x + y) / (diameter * 0.19)) + Math.abs((x - y) / (diameter * 0.35)) <= 1;
}

function sample(variant, x, y) {
  const wishlist = variant.wishlist || variant.symbol === 'bookmark';
  const color = wishlist ? teal : rust;
  const radius = Math.hypot(x, y);
  if (variant.selected && radius <= 20 && radius > 15) return [...color.slice(0, 3), 46];
  if (radius > variant.diameter / 2) return transparent;
  const dot = !variant.symbol;
  if (radius > variant.diameter / 2 - 1)
    return dot || variant.selected ? paper : wishlist ? tealBorder : border;
  if (variant.symbol && symbolContains(variant.symbol, x, y, variant.diameter))
    return variant.selected ? paper : color;
  return dot || variant.selected ? color : paper;
}

// Small, dependency-free PNG encoder. Every scanline uses PNG's no-filter mode.
function chunk(type, data) {
  const name = Buffer.from(type);
  const crcInput = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of crcInput) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const footer = Buffer.alloc(4);
  footer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, name, data, footer]);
}

function png(variant, density) {
  const canvas = variant.selected ? 40 : variant.diameter + 4;
  const pixels = canvas * density;
  const rows = Buffer.alloc((pixels * 4 + 1) * pixels);
  const samples = 4;
  for (let y = 0; y < pixels; y++) {
    for (let x = 0; x < pixels; x++) {
      const channels = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const color = sample(
            variant,
            (x + (sx + 0.5) / samples) / density - canvas / 2,
            (y + (sy + 0.5) / samples) / density - canvas / 2,
          );
          const alpha = color[3] / 255;
          for (let c = 0; c < 3; c++) channels[c] += color[c] * alpha;
          channels[3] += alpha;
        }
      }
      const offset = y * (pixels * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++)
        rows[offset + c] = channels[3] ? Math.round(channels[c] / channels[3]) : 0;
      rows[offset + 3] = Math.round((channels[3] / samples ** 2) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(pixels, 0);
  header.writeUInt32BE(pixels, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(directory, { recursive: true });
for (const variant of variants) {
  for (const density of [1, 2, 3]) {
    const suffix = density === 1 ? '' : `@${density}x`;
    await writeFile(new URL(`${variant.name}${suffix}.png`, directory), png(variant, density));
  }
}
