// Gradient extraction from raster images.
//
// Decodes a PNG/JPG, identifies the dominant background gradient (vertical
// or horizontal, 2/3/5 stops), and returns a descriptor that can be turned
// into a Figma GRADIENT_LINEAR paint or a CSS string.
//
// Robust to image borders (auto-trimmed) and content-heavy images. Per
// sample band we cluster pixels in a coarse RGB histogram (16-step bins)
// and take the centroid of the largest bin — that's the background color
// in that band, even if the band also contains text/photos/widgets.

import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { readFileSync } from 'fs';
import { extname } from 'path';

export function loadImage(path) {
  const buf = readFileSync(path);
  const ext = extname(path).toLowerCase();
  if (ext === '.png') {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    const j = jpeg.decode(buf, { useTArray: true });
    return { width: j.width, height: j.height, data: j.data };
  }
  throw new Error(`Unsupported image format "${ext}". Use PNG or JPG.`);
}

function pixelAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

// Trim outer rows/cols that are uniformly black or fully transparent.
function detectInnerBox(img) {
  const { width: w, height: h } = img;
  const isBorder = (r, g, b, a) => a === 0 || r + g + b < 30;
  const rowAllBorder = (y) => {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixelAt(img, x, y);
      if (!isBorder(r, g, b, a)) return false;
    }
    return true;
  };
  const colAllBorder = (x, y0, y1) => {
    for (let y = y0; y <= y1; y++) {
      const [r, g, b, a] = pixelAt(img, x, y);
      if (!isBorder(r, g, b, a)) return false;
    }
    return true;
  };
  let top = 0;
  while (top < h && rowAllBorder(top)) top++;
  let bottom = h - 1;
  while (bottom > top && rowAllBorder(bottom)) bottom--;
  let left = 0;
  while (left < w && colAllBorder(left, top, bottom)) left++;
  let right = w - 1;
  while (right > left && colAllBorder(right, top, bottom)) right--;
  return { left, top, right, bottom };
}

// Dominant color in a rectangle, found by quantizing pixels into 16-step
// RGB bins and taking the centroid of the largest bin.
function dominantColor(img, x0, y0, x1, y1) {
  const bins = new Map();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [r, g, b, a] = pixelAt(img, x, y);
      if (a === 0) continue;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let bin = bins.get(key);
      if (!bin) {
        bin = { r: 0, g: 0, b: 0, n: 0 };
        bins.set(key, bin);
      }
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.n++;
    }
  }
  let best = null;
  for (const bin of bins.values()) {
    if (!best || bin.n > best.n) best = bin;
  }
  if (!best) return null;
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}

function rgbDist(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Compare color variation along vertical vs horizontal to pick the axis.
function detectDirection(img, box) {
  const sampleAxis = (vertical, n) => {
    const colors = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let c;
      if (vertical) {
        const y = box.top + Math.round((box.bottom - box.top) * t);
        const pad = 2;
        c = dominantColor(img, box.left, Math.max(box.top, y - pad), box.right, Math.min(box.bottom, y + pad));
      } else {
        const x = box.left + Math.round((box.right - box.left) * t);
        const pad = 2;
        c = dominantColor(img, Math.max(box.left, x - pad), box.top, Math.min(box.right, x + pad), box.bottom);
      }
      if (c) colors.push(c);
    }
    if (colors.length < 2) return 0;
    return rgbDist(colors[0], colors[colors.length - 1]);
  };
  const vDelta = sampleAxis(true, 8);
  const hDelta = sampleAxis(false, 8);
  return vDelta >= hDelta
    ? { dir: 'vertical', angle: 180 }
    : { dir: 'horizontal', angle: 90 };
}

function extractStops(img, box, dir, n) {
  const stops = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let c;
    if (dir.dir === 'vertical') {
      const y = box.top + Math.round((box.bottom - box.top) * t);
      const band = Math.max(2, Math.round((box.bottom - box.top) / (n * 6)));
      c = dominantColor(img, box.left, Math.max(box.top, y - band), box.right, Math.min(box.bottom, y + band));
    } else {
      const x = box.left + Math.round((box.right - box.left) * t);
      const band = Math.max(2, Math.round((box.right - box.left) / (n * 6)));
      c = dominantColor(img, Math.max(box.left, x - band), box.top, Math.min(box.right, x + band), box.bottom);
    }
    if (!c) c = [128, 128, 128];
    stops.push({ position: t, rgb: c });
  }
  return stops;
}

export function extractGradient(path, opts = {}) {
  const img = loadImage(path);
  const box = opts.trim === false
    ? { left: 0, top: 0, right: img.width - 1, bottom: img.height - 1 }
    : detectInnerBox(img);
  const dirRaw = opts.direction || 'auto';
  let dir;
  if (dirRaw === 'auto') dir = detectDirection(img, box);
  else if (dirRaw === 'vertical' || dirRaw === '180') dir = { dir: 'vertical', angle: 180 };
  else if (dirRaw === 'horizontal' || dirRaw === '90') dir = { dir: 'horizontal', angle: 90 };
  else throw new Error(`Unknown direction "${dirRaw}". Use auto|vertical|horizontal.`);
  const nStops = opts.stops || 3;
  const stops = extractStops(img, box, dir, nStops);
  return {
    direction: dir.dir,
    angle: dir.angle,
    box,
    imageSize: { width: img.width, height: img.height },
    stops,
  };
}

export function buildFigmaPaint(result) {
  const angle = result.angle;
  const rad = ((angle - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tx = 0.5 - 0.5 * cos + 0.5 * sin;
  const ty = 0.5 - 0.5 * sin - 0.5 * cos;
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[cos, -sin, tx], [sin, cos, ty]],
    gradientStops: result.stops.map((s) => ({
      position: s.position,
      color: { r: s.rgb[0] / 255, g: s.rgb[1] / 255, b: s.rgb[2] / 255, a: 1 },
    })),
    opacity: 1,
    visible: true,
    blendMode: 'NORMAL',
  };
}

export function buildCssString(result) {
  const stops = result.stops.map((s) => {
    const hex = '#' + s.rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `${hex} ${Math.round(s.position * 100)}%`;
  });
  return `linear-gradient(${result.angle}deg, ${stops.join(', ')})`;
}

// ─── MESH mode ──────────────────────────────────────────────────────────
//
// Figma has no real mesh-gradient primitive (the Plugin API rejects
// GRADIENT_MESH explicitly). The visual character of mesh gradients
// (smooth 2D color interpolation, no hard iso-lines) is best approximated
// by stacking heavily Layer-Blur'd colored ellipses inside a clipping
// frame — a well-known designer trick.
//
// extractMesh() samples key positions of the source image and returns
// a "recipe" describing the blobs to create. The applier turns that
// recipe into a Figma Frame containing the blur-stacked ellipses.

function dominantColorAt(img, fx, fy, halfBand = 30) {
  const cx = Math.round(fx * img.width);
  const cy = Math.round(fy * img.height);
  const x0 = Math.max(0, cx - halfBand);
  const x1 = Math.min(img.width - 1, cx + halfBand);
  const y0 = Math.max(0, cy - halfBand);
  const y1 = Math.min(img.height - 1, cy + halfBand);
  return dominantColor(img, x0, y0, x1, y1) || [128, 128, 128];
}

function rgbToHex(rgb) {
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Scan a region and return the brightest cell (by mean R+G+B), to locate
// the "light hotspot" (e.g. white dome at the top of a mesh gradient).
function brightestSpot(img, box, opts = {}) {
  const cells = opts.cells || 16;
  const xMin = opts.xMin ?? 0.0;
  const xMax = opts.xMax ?? 1.0;
  const yMin = opts.yMin ?? 0.0;
  const yMax = opts.yMax ?? 1.0;
  const W = box.right - box.left;
  const H = box.bottom - box.top;
  let best = { v: -1, fx: 0.5, fy: 0.5, color: [255, 255, 255] };
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const fx = xMin + (xMax - xMin) * (i / (cells - 1));
      const fy = yMin + (yMax - yMin) * (j / (cells - 1));
      const x = box.left + Math.round(W * fx);
      const y = box.top + Math.round(H * fy);
      const pad = Math.max(4, Math.round(Math.min(W, H) / 60));
      const c = dominantColor(
        img,
        Math.max(box.left, x - pad), Math.max(box.top, y - pad),
        Math.min(box.right, x + pad), Math.min(box.bottom, y + pad),
      );
      if (!c) continue;
      const v = (c[0] + c[1] + c[2]) / 3;
      if (v > best.v) best = { v, fx, fy, color: c };
    }
  }
  return best;
}

// Scan a region and return the most "warm-saturated" cell — proxy for the
// red/pink hotspot. We score pixels by (R - 0.5 * (G + B)): high red
// dominance with not-too-light pixels wins.
function reddestSpot(img, box, opts = {}) {
  const cells = opts.cells || 16;
  const xMin = opts.xMin ?? 0.2;
  const xMax = opts.xMax ?? 0.8;
  const yMin = opts.yMin ?? 0.5;
  const yMax = opts.yMax ?? 0.95;
  const W = box.right - box.left;
  const H = box.bottom - box.top;
  let best = { score: -1e9, fx: 0.5, fy: 0.85, color: [200, 80, 80] };
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const fx = xMin + (xMax - xMin) * (i / (cells - 1));
      const fy = yMin + (yMax - yMin) * (j / (cells - 1));
      const x = box.left + Math.round(W * fx);
      const y = box.top + Math.round(H * fy);
      const pad = Math.max(4, Math.round(Math.min(W, H) / 60));
      const c = dominantColor(
        img,
        Math.max(box.left, x - pad), Math.max(box.top, y - pad),
        Math.min(box.right, x + pad), Math.min(box.bottom, y + pad),
      );
      if (!c) continue;
      const score = c[0] - 0.5 * (c[1] + c[2]);
      if (score > best.score) best = { score, fx, fy, color: c };
    }
  }
  return best;
}

// Channel-wise average of a list of [r,g,b] tuples — used to derive the
// base solid (warm mid-tone) under the blob stack.
function averageColor(colors) {
  const sum = [0, 0, 0];
  for (const c of colors) {
    sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
  }
  return [
    Math.round(sum[0] / colors.length),
    Math.round(sum[1] / colors.length),
    Math.round(sum[2] / colors.length),
  ];
}

export function extractMesh(path, opts = {}) {
  const img = loadImage(path);
  const box = opts.trim === false
    ? { left: 0, top: 0, right: img.width - 1, bottom: img.height - 1 }
    : detectInnerBox(img);
  const halfBand = Math.max(8, Math.round(Math.min(box.right - box.left, box.bottom - box.top) / 60));
  const sampleUV = (fx, fy) => {
    const x = box.left + Math.round((box.right - box.left) * fx);
    const y = box.top + Math.round((box.bottom - box.top) * fy);
    const c = dominantColor(
      img,
      Math.max(box.left, x - halfBand), Math.max(box.top, y - halfBand),
      Math.min(box.right, x + halfBand), Math.min(box.bottom, y + halfBand),
    );
    return c || [128, 128, 128];
  };

  // 4 corners + 2 mid-sides + 1 mid-center give the "structural" mesh anchors.
  const TL = sampleUV(0.05, 0.05);
  const TR = sampleUV(0.95, 0.05);
  const BL = sampleUV(0.05, 0.95);
  const BR = sampleUV(0.95, 0.95);
  const ML = sampleUV(0.05, 0.50);
  const MR = sampleUV(0.95, 0.50);
  const MC = sampleUV(0.50, 0.50);

  // Hotspots — light dome (typically top-center) and warm focal (often bottom).
  const light = brightestSpot(img, box, { yMax: 0.4 });
  const warm = reddestSpot(img, box);

  // Stack order: side accents go bottom, corner blobs over them, then the
  // warm focal, finally the light dome on top. This is what visually
  // reproduced blossom best in testing.
  const blobs = [
    { fx: -0.05, fy: 0.45, r: 0.50, color: rgbToHex(ML) },
    { fx:  1.05, fy: 0.55, r: 0.48, color: rgbToHex(MR) },
    { fx: -0.02, fy: -0.02, r: 0.40, color: rgbToHex(TL) },
    { fx:  1.02, fy: -0.02, r: 0.40, color: rgbToHex(TR) },
    { fx: -0.02, fy:  1.02, r: 0.42, color: rgbToHex(BL) },
    { fx:  1.02, fy:  1.02, r: 0.42, color: rgbToHex(BR) },
    { fx: warm.fx, fy: warm.fy, r: 0.42, color: rgbToHex(warm.color) },
    { fx: light.fx, fy: light.fy, r: 0.50, color: rgbToHex(light.color) },
  ];

  return {
    mode: 'mesh',
    base: rgbToHex(MC),
    blobs,
    blurFraction: 0.38,   // fraction of min(W, H) — applied at apply time
    imageSize: { width: img.width, height: img.height },
    box,
  };
}

