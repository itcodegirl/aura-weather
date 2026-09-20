// Generates public/apple-touch-icon.png — a 180x180 square PNG that
// matches the new Aura brand mark. iOS requires PNG for the home-
// screen icon (SVG/manifest fallbacks don't apply), and the previous
// apple-touch-icon was reusing /og-image.png which is a 1200x630
// banner, so iOS rendered it as a hard crop.
//
// We render the brand mark — concentric rings radiating from a
// bright centre — directly into pixels via pure Node + zlib. No new
// dependency. Run once after the brand mark changes; commit the
// resulting public/apple-touch-icon.png.
//
// Usage: node scripts/generate-apple-touch-icon.mjs

import { writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, constants as zlibConstants } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "public", "apple-touch-icon.png");

const SIZE = 180;
const CENTER = SIZE / 2;

// Background gradient stops.
//
// These no longer match anything else in the app, and the comment that used
// to sit here said they matched "the existing theme-color fallback" -- a
// static theme-color of #0b1c3f that index.html replaced with a per-scheme
// pair (#070a10 dark / #e4e9ef light) when the light scheme landed. No CSS
// token is #0b1c3f or #050c22 any more.
//
// They are deliberately left as they are. An iOS home-screen icon is
// scheme-blind -- one bitmap, shown on whatever wallpaper the user has --
// so it has no light variant to drift from, and restyling a brand mark is
// a design decision rather than a token fix. The manifest's theme_color
// and background_color, which DO get composited against the app's own
// ground, were the real drift and are now #070a10.
const BG_TOP = [11, 28, 63]; // #0b1c3f
const BG_BOTTOM = [5, 12, 34]; // deeper navy
const RING_OUTER = [188, 214, 255];
const RING_CENTER = [255, 255, 255];

const RINGS = [
  { radius: 76, width: 4, alpha: 0.18 },
  { radius: 54, width: 5, alpha: 0.36 },
  { radius: 32, width: 6, alpha: 0.62 },
];
const CENTER_DOT_RADIUS = 12;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRgb(rgbA, rgbB, t) {
  return [
    Math.round(lerp(rgbA[0], rgbB[0], t)),
    Math.round(lerp(rgbA[1], rgbB[1], t)),
    Math.round(lerp(rgbA[2], rgbB[2], t)),
  ];
}

function blend(base, overlay, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + overlay[0] * alpha),
    Math.round(base[1] * (1 - alpha) + overlay[1] * alpha),
    Math.round(base[2] * (1 - alpha) + overlay[2] * alpha),
  ];
}

function pixelColor(x, y) {
  const t = y / (SIZE - 1);
  let color = lerpRgb(BG_TOP, BG_BOTTOM, t);

  const dx = x - CENTER + 0.5;
  const dy = y - CENTER + 0.5;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Soft anti-aliased ring strokes.
  for (const ring of RINGS) {
    const halfWidth = ring.width / 2;
    const offset = Math.abs(distance - ring.radius);
    if (offset <= halfWidth + 0.5) {
      const edge = Math.max(0, Math.min(1, (halfWidth + 0.5 - offset) / 1));
      color = blend(color, RING_OUTER, ring.alpha * edge);
    }
  }

  // Bright centre dot.
  if (distance <= CENTER_DOT_RADIUS + 0.5) {
    const edge = Math.max(0, Math.min(1, CENTER_DOT_RADIUS + 0.5 - distance));
    color = blend(color, RING_CENTER, edge);
  }

  return color;
}

function buildRawPixels() {
  const stride = SIZE * 4 + 1; // 1 filter byte per row + RGBA bytes
  const raw = Buffer.alloc(stride * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type 0 (None)
    for (let x = 0; x < SIZE; x += 1) {
      const [r, g, b] = pixelColor(x, y);
      const offset = rowStart + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = 255;
    }
  }
  return raw;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function buildIhdr() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type RGBA
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // interlace
  return chunk("IHDR", header);
}

function buildIdat(rawPixels) {
  const compressed = deflateSync(rawPixels, {
    level: zlibConstants.Z_BEST_COMPRESSION,
  });
  return chunk("IDAT", compressed);
}

function buildIend() {
  return chunk("IEND", Buffer.alloc(0));
}

const png = Buffer.concat([
  PNG_SIGNATURE,
  buildIhdr(),
  buildIdat(buildRawPixels()),
  buildIend(),
]);

writeFileSync(OUT_PATH, png);
console.log(
  `Wrote ${png.length} bytes to ${OUT_PATH.replace(resolve(__dirname, "..") + "/", "")}`
);
void join;
