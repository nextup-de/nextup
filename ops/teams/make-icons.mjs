// Draws ops/teams/color.png (192 x 192, #1286fc with a white N) and ops/teams/outline.png (32 x 32, white on
// transparent). node:zlib and Buffer only. Run: node ops/teams/make-icons.mjs
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
  return out;
}

/** RGBA pixels (size x size x 4) to a PNG. */
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Is (x, y) inside the N? Unit coordinates 0..1 inside the letter box: two stems and a diagonal. */
function inN(u, v, stem) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  if (u <= stem || u >= 1 - stem) return true;
  const centre = stem + (1 - 2 * stem) * v; // the diagonal runs top-left to bottom-right
  return Math.abs(u - centre) <= stem * 0.75;
}

function draw(size, box, stem, fg, bg) {
  const buf = Buffer.alloc(size * size * 4);
  const lo = (size - box) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hit = inN((x + 0.5 - lo) / box, (y + 0.5 - lo) / box, stem);
      const c = hit ? fg : bg;
      buf.set(c, (y * size + x) * 4);
    }
  }
  return buf;
}

// No anti-aliasing: Teams rejects a grey halo on the transparent outline.
const color = draw(192, 96, 0.2, [255, 255, 255, 255], [0x12, 0x86, 0xfc, 255]);
const outline = draw(32, 18, 0.22, [255, 255, 255, 255], [0, 0, 0, 0]);
writeFileSync(join(here, "color.png"), png(192, color));
writeFileSync(join(here, "outline.png"), png(32, outline));
console.log("wrote color.png and outline.png");
