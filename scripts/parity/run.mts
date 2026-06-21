/**
 * Image-extraction parity harness (throwaway / re-runnable).
 *
 * 1. Builds the deterministic fixture image (src/core/extract.fixture.ts).
 * 2. Encodes it to a lossless 8-bit RGBA PNG → scripts/parity/parity.png
 *    (read by the Rust crate for ground truth).
 * 3. Runs colorthief@3 on it ({ colorCount: 15, quality: 1, colorSpace: 'rgb' })
 *    and prints the dominant palette to paste into extract.fixture.ts.
 *
 * Run: npx tsx scripts/parity/run.mts
 */
import { writeFileSync } from "node:fs";
import zlib from "node:zlib";
import { genParityImage } from "../../src/core/extract.fixture";

// colorthief's Node loader decodes via `sharp`; we already have raw pixels, so
// shim a minimal `ImageData` global and feed the buffer straight to the
// browser-style sync loader (no decode, no sharp dependency). This is the same
// path the real UI adapter uses (getPaletteSync(ImageData)).
class ShimImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = "srgb" as const;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}
(globalThis as Record<string, unknown>).ImageData = ShimImageData;
const { getPaletteSync } = await import("colorthief");

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // compression(10)/filter(11)/interlace(12) all 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    for (let i = 0; i < stride; i++) raw[y * (stride + 1) + 1 + i] = rgba[y * stride + i]!;
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const { width, height, pixels } = genParityImage();
const png = encodePng(width, height, pixels);
const pngPath = new URL("./parity.png", import.meta.url).pathname;
writeFileSync(pngPath, png);
console.log(`wrote ${pngPath} (${width}×${height}, ${png.length} bytes)`);

const imageData = new ShimImageData(pixels, width, height) as unknown as ImageData;
const palette = getPaletteSync(imageData, { colorCount: 15, quality: 1, colorSpace: "rgb" });
if (!palette) throw new Error("colorthief returned null");
const dominant = palette.map((c) => c.rgb());
console.log("\n// paste into extract.fixture.ts → DOMINANT_PALETTE");
console.log(
  "export const DOMINANT_PALETTE: Rgb[] = [\n" +
    dominant.map((c) => `  { r: ${c.r}, g: ${c.g}, b: ${c.b} },`).join("\n") +
    "\n];",
);
