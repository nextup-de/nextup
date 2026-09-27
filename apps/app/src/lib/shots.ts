// Screenshots attached to a raised case. They stay in this browser: localStorage only, keyed per
// company, one entry per case id. The event log keeps just the count (a fact); the pixels live
// here, shrunk to a small WebP/JPEG data URL so a handful of cases fit in the ~5 MB budget.
// Later a backend just becomes another place the same images come from.

export type Shot = { name: string; url: string };

const MAX_EDGE = 1400; // longest side after downscaling
const QUALITY = 0.82;

const shotsKey = (slug: string) => "nextup." + slug + ".shots.v1";
const oldShotsKey = (slug: string) => "nexthub." + slug + ".shots.v1"; // pre-rename key, moved over once

type ShotBook = Record<string, Shot[]>;

function readBook(slug: string): ShotBook {
  try {
    const old = localStorage.getItem(oldShotsKey(slug));
    if (old !== null) { if (localStorage.getItem(shotsKey(slug)) === null) localStorage.setItem(shotsKey(slug), old); localStorage.removeItem(oldShotsKey(slug)); }
    const v = localStorage.getItem(shotsKey(slug)); return v ? (JSON.parse(v) as ShotBook) : {};
  } catch { return {}; }
}
function writeBook(slug: string, book: ShotBook): boolean {
  try { localStorage.setItem(shotsKey(slug), JSON.stringify(book)); return true; } catch { return false; /* quota or private mode */ }
}

// A picked file -> a compact data URL. Downscales on a canvas; prefers WebP (smaller for UI
// screenshots), falls back to JPEG where the browser cannot encode WebP.
export function shrinkImage(file: File): Promise<Shot> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(src);
      const k = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const g = canvas.getContext("2d");
      if (!g) { reject(new Error("no canvas")); return; }
      g.drawImage(img, 0, 0, w, h);
      let url = canvas.toDataURL("image/webp", QUALITY);
      if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", QUALITY);
      resolve({ name: file.name, url });
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("not an image")); };
    img.src = src;
  });
}

export function loadShots(slug: string, caseId: string): Shot[] {
  return readBook(slug)[caseId] ?? [];
}
// Returns false when the browser refused (quota); the case is still raised, the pictures are not kept.
export function saveShots(slug: string, caseId: string, shots: Shot[]): boolean {
  if (!shots.length) return true;
  const book = readBook(slug);
  book[caseId] = shots;
  return writeBook(slug, book);
}
export function dropShots(slug: string, caseIds: Iterable<string>) {
  const book = readBook(slug);
  let touched = false;
  for (const id of caseIds) if (id in book) { delete book[id]; touched = true; }
  if (touched) writeBook(slug, book);
}
export function clearShots(slug: string) {
  try { localStorage.removeItem(shotsKey(slug)); } catch { /* ignore */ }
}
