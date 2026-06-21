/**
 * Image decode + quantization adapter (IMPURE — IMAGE-EXTRACTION.md §5).
 *
 * The only place `colorthief` and the canvas live. A single decode serves both
 * consumers: color-thief reads the `ImageData`, and the pure closest-hue pass
 * (`src/core/extract.ts`) reads the same `imageData.data` buffer. The image is
 * decoded entirely in the browser and never leaves the page.
 */

import { getPaletteSync } from "colorthief";
import type { Rgb } from "../core";

/** Cap the longest side; bounds the closest-hue pass + color-thief work (§10). */
const MAX_DIM = 1280;

export interface DecodeResult {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  dominantPalette: Rgb[];
}

/** Decode `file` to an offscreen canvas, returning its pixels + dominant palette. */
export async function decodeForExtraction(file: File): Promise<DecodeResult> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");

  const { source, width, height } = await loadImageSource(file);
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Couldn't read that image.");
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();

  const imageData = ctx.getImageData(0, 0, w, h);
  const palette = getPaletteSync(imageData, { colorCount: 15, quality: 1, colorSpace: "rgb" });
  if (!palette?.length) throw new Error("Couldn't find usable colors in this image.");

  // color-thief skips transparent / near-white pixels internally — no filtering
  // for us to maintain.
  const dominantPalette: Rgb[] = palette.map((c) => c.rgb());
  return { pixels: imageData.data, width: w, height: h, dominantPalette };
}

/** Decode to an ImageBitmap, falling back to an <img> where that's unavailable. */
async function loadImageSource(
  file: File,
): Promise<{ source: ImageBitmap | HTMLImageElement; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height };
    } catch {
      /* fall through to the <img> path */
    }
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    const url = URL.createObjectURL(file);
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image."));
    };
    el.src = url;
  });
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("Couldn't read that image.");
  return { source: img, width: img.naturalWidth, height: img.naturalHeight };
}
