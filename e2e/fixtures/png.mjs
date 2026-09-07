import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Encodes a solid color RGB PNG entirely in memory, used as a fake IIIF tile.
 * @param {number} width
 * @param {number} height
 * @param {[number, number, number]} color
 * @returns {Buffer} PNG encoded image
 */
export function createTestTile(width = 256, height = 256, color = [204, 102, 153]) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const offset = rowStart + 1 + x * 3;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
    }
  }
  return encodePng(width, height, raw);
}

/**
 * Encodes an asymmetric pattern PNG: offsets and cuts are visually verifiable
 * with it, a solid color tile would hide any seam misalignment.
 * @param {number} width
 * @param {number} height
 * @returns {Buffer} PNG encoded image
 */
export function createPatternedTile(width = 256, height = 256) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  const background = [235, 235, 230];
  const set = (x, y, [r, g, b]) => {
    const offset = y * (stride + 1) + 1 + x * 3;
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
  };
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      set(x, y, background);
    }
  }
  // Black square in the top left corner
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      set(x, y, [20, 20, 20]);
    }
  }
  // Red bar at the right edge
  for (let y = 100; y < 156; y++) {
    for (let x = width - 20; x < width; x++) {
      set(x, y, [200, 30, 30]);
    }
  }
  // Blue bar at the bottom edge
  for (let y = height - 20; y < height; y++) {
    for (let x = 100; x < 156; x++) {
      set(x, y, [30, 60, 200]);
    }
  }
  // Green circle in the center
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const radius = Math.min(width, height) / 6;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) {
        set(x, y, [30, 160, 60]);
      }
    }
  }
  return encodePng(width, height, raw);
}

function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
