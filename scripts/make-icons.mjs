// Generates PWA icons (PNG) without external dependencies.
// Draws a 2x2 grid of colored blocks on a dark rounded-ish background.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const COLORS = [
  [0x00, 0x72, 0xb2],
  [0xe6, 0x9f, 0x00],
  [0x00, 0x9e, 0x73],
  [0xcc, 0x79, 0xa7],
];
const BG = [0x14, 0x17, 0x1a];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const px = Buffer.alloc(size * size * 3);
  const pad = Math.round(size * 0.16);
  const gap = Math.round(size * 0.05);
  const cell = Math.floor((size - 2 * pad - gap) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BG;
      const gx = x - pad, gy = y - pad;
      const cx = gx < cell ? 0 : gx >= cell + gap && gx < 2 * cell + gap ? 1 : -1;
      const cy = gy < cell ? 0 : gy >= cell + gap && gy < 2 * cell + gap ? 1 : -1;
      if (gx >= 0 && gy >= 0 && cx >= 0 && cy >= 0) color = COLORS[cy * 2 + cx];
      const o = (y * size + x) * 3;
      px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2];
    }
  }
  // Add filter byte (0) per scanline
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), makePng(size));
  console.log(`icon-${size}.png written`);
}
