// Generates the Alter diamond icon as PNGs + a Windows .ico, with no image dependencies.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(import.meta.dirname, '..', 'build');
mkdirSync(out, { recursive: true });

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, { background = true } = {}) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const ss = 4; // supersampling for smooth edges
  const c = size / 2;
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let bg = 0, outer = 0, inner = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
          // rounded square background
          const dx = Math.max(Math.abs(px - c) - (c - radius), 0), dy = Math.max(Math.abs(py - c) - (c - radius), 0);
          if (dx * dx + dy * dy <= radius * radius) bg++;
          const d = Math.abs(px - c) + Math.abs(py - c);
          if (d <= size * 0.32) outer++;
          if (d <= size * 0.155) inner++;
        }
      }
      const n = ss * ss;
      const a = background ? bg / n : 0;
      const diamond = (outer - inner) / n;
      // background #0f0e13, diamond #8b7bff
      const alpha = Math.min(1, a + diamond * (1 - a));
      const mix = (b, f) => Math.round(alpha ? (b * a * (1 - diamond) + f * diamond) / (a * (1 - diamond) + diamond || 1) : 0);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = mix(0x0f, 0x8b);
      raw[i + 1] = mix(0x0e, 0x7b);
      raw[i + 2] = mix(0x13, 0xff);
      raw[i + 3] = Math.round(alpha * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((size) => ({ size, data: png(size) }));
writeFileSync(join(out, 'icon.png'), png(512));
writeFileSync(join(out, 'icon.ico'), ico(pngs));
writeFileSync(join(out, 'tray.png'), png(32, { background: false }));
writeFileSync(join(out, 'tray@2x.png'), png(64, { background: false }));
console.log('icons written to', out);
