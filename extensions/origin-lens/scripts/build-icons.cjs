// Dependency-free PNG exports of icons/origin-lens.svg's 16-unit geometry.
// Four samples per axis smooth curves; stems align to whole pixels at 16px.
const fs = require('node:fs');
const path = require('node:path');
const { deflateSync } = require('node:zlib');
const directory = path.join(__dirname, '..', 'icons');
const sizes = [16, 32, 48, 128];
const ink = [24, 24, 24], paper = [244, 244, 240];
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(type, data) {
  const name = Buffer.from(type), body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0); body.copy(output, 4);
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
  return output;
}
function mark(x, y) {
  const distance = Math.hypot(x - 8, y - 8);
  return (distance >= 3 && distance <= 5) || distance <= 1 ||
    (x >= 7 && x <= 9 && ((y >= 2 && y <= 4) || (y >= 12 && y <= 14))) ||
    (y >= 7 && y <= 9 && ((x >= 2 && x <= 4) || (x >= 12 && x <= 14)));
}
fs.mkdirSync(directory, { recursive: true });
for (const size of sizes) {
  const pixels = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let coverage = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      if (mark((x + (sx + 0.5) / 4) * 16 / size, (y + (sy + 0.5) / 4) * 16 / size)) coverage++;
    }
    const offset = y * (1 + size * 4) + 1 + x * 4;
    for (let c = 0; c < 3; c++) pixels[offset + c] = Math.round(ink[c] + (paper[c] - ink[c]) * coverage / 16);
    pixels[offset + 3] = 255;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('sRGB', Buffer.from([0])),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(path.join(directory, `icon-${size}.png`), png);
  console.log(`icon-${size}.png: ${size} × ${size}`);
}
