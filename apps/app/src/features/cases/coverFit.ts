// Step 3 of a Feed cover (docs/AI_COVERS.md): image models do not always keep the text zones empty,
// so every picture is checked and, if needed, placed safely before a card shows it. Text must never
// overlap an object. Pure: works on a small RGB sample of the picture (160×90), so it runs wherever
// the pixels can be read (a script for the library, the server for generated covers).
//
//   3a  safe-zone check: the top band (author row) and the bottom-left box (number + line) must be
//       at least 97% backdrop.
//   3b  safe placement: shrink the picture (down to 70%), anchored bottom-right on the backdrop,
//       until the objects' bounding box clears both zones; if 70% is not enough, the plain fallback.
export const SAMPLE_W = 160, SAMPLE_H = 90;
export const BACKDROP: readonly [number, number, number] = [0xee, 0xf4, 0xfd];
const EMPTY_DE = 8; // ΔE (CIE76) under this = backdrop
const MIN_EMPTY = 0.97;
const MIN_SCALE = 0.7;

// The two zones, as fractions of the cover: [x0, y0, x1, y1].
export const TOP_BAND = [0, 0, 1, 0.36] as const;
export const STAT_BOX = [0, 0.55, 0.45, 1] as const;

export type CoverFit = { status: "pass" | "safe-placed" | "fallback"; scale: number };

// sRGB -> CIE Lab (D65), for the ΔE comparison.
function lab([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), y = f(R * 0.2126 + G * 0.7152 + B * 0.0722), z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const BG = lab(BACKDROP);
export const isBackdrop = (rgb: readonly [number, number, number]) => {
  const [l, a, b] = lab(rgb);
  return Math.hypot(l - BG[0], a - BG[1], b - BG[2]) < EMPTY_DE;
};

// The picture's object pixels (not backdrop), as cell centres in 0..1, from an RGB(A) buffer.
export function objectPoints(px: Uint8Array | Uint8ClampedArray, w = SAMPLE_W, h = SAMPLE_H, channels = 3): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * channels;
    if (!isBackdrop([px[i], px[i + 1], px[i + 2]])) out.push([(x + 0.5) / w, (y + 0.5) / h]);
  }
  return out;
}

// How full a zone is once the picture is scaled by `s` and anchored bottom-right (1 = as is).
function filled(points: readonly [number, number][], s: number, [x0, y0, x1, y1]: readonly number[], w: number, h: number): number {
  let n = 0;
  for (const [x, y] of points) {
    const X = 1 - s + s * x, Y = 1 - s + s * y;
    if (X >= x0 && X < x1 && Y >= y0 && Y < y1) n++;
  }
  // Each source cell covers s² of a cover cell.
  return (n * s * s) / ((x1 - x0) * w * (y1 - y0) * h);
}
const clear = (points: readonly [number, number][], s: number, w: number, h: number) =>
  filled(points, s, TOP_BAND, w, h) <= 1 - MIN_EMPTY && filled(points, s, STAT_BOX, w, h) <= 1 - MIN_EMPTY;

// The objects' bounding box, ignoring stray specks: the outer 0.5% of object pixels on each side.
export function objectBox(points: readonly [number, number][]): [number, number, number, number] | null {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]).sort((a, b) => a - b), ys = points.map((p) => p[1]).sort((a, b) => a - b);
  const k = Math.floor(points.length * 0.005), at = (v: number[], i: number) => v[Math.min(v.length - 1, Math.max(0, i))];
  return [at(xs, k), at(ys, k), at(xs, xs.length - 1 - k), at(ys, ys.length - 1 - k)];
}

// The largest scale s (anchored bottom-right, so shrinking moves everything right and down) at
// which the box sits below the top band and either right of the number's box or above it:
//   below the band   s ≤ (1 - 0.36) / (1 - y0)
//   right of the box s ≤ (1 - 0.45) / (1 - x0)
//   above the box    s ≥ (1 - 0.55) / (1 - y1)
export function boxScale([x0, y0, , y1]: readonly number[]): number {
  const half = 0.5 / SAMPLE_W; // the box edges are cell centres: reach out half a cell
  const top = (1 - TOP_BAND[3]) / Math.max(1e-9, 1 - (y0 - half));
  const right = (1 - STAT_BOX[2]) / Math.max(1e-9, 1 - (x0 - half));
  const aboveFrom = y1 + half >= 1 ? Infinity : (1 - STAT_BOX[1]) / (1 - (y1 + half));
  const best = Math.min(1, top);
  return best <= right || best >= aboveFrom ? best : Math.min(best, right);
}

export function fitCover(points: readonly [number, number][], w = SAMPLE_W, h = SAMPLE_H): CoverFit {
  if (clear(points, 1, w, h)) return { status: "pass", scale: 1 };
  const box = objectBox(points);
  if (!box) return { status: "pass", scale: 1 };
  const s = Math.floor(boxScale(box) * 100) / 100;
  return s >= MIN_SCALE ? { status: "safe-placed", scale: s } : { status: "fallback", scale: 0 };
}
