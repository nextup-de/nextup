// Feed covers while the AI generator is switched off (features/cases/cover.ts keeps it for later):
// a fixed picture per sample idea, and for every other case one from a small library, picked by
// its id so a card always gets the same one. Pure; the pictures live in public/feed/.

// A picture and its Step 3 placement (docs/AI_COVERS.md, features/cases/coverFit.ts), measured
// once when the picture was added: 1 = as is, below 1 = shrunk into the bottom-right corner.
// stat + hook: the cover's text (docs/AI_COVERS.md: max 7 characters, 2-4 words / 24 characters).
// Until the text model writes it per idea, it is preset with the picture - one short word, never a
// number, because the picture does not know the idea's numbers.
export type CoverPic = { src: string; fit: number; stat: string; hook: string };

// The library (public/feed/library/): ten general scenes made with the prompts in docs/AI_COVERS.md's
// style. Every case without its own picture gets one of these.
export const COVER_LIBRARY: readonly CoverPic[] = [
  { src: "/feed/library/01-shift-handover.webp", fit: 1, stat: "Clear", hook: "handover between shifts" },
  { src: "/feed/library/02-less-waste.webp", fit: 1, stat: "Reuse", hook: "less going to waste" },
  { src: "/feed/library/03-safety.webp", fit: 1, stat: "Safer", hook: "a hazard taken away" },
  { src: "/feed/library/04-tools-in-place.webp", fit: 1, stat: "Found", hook: "every tool in place" },
  { src: "/feed/library/05-less-downtime.webp", fit: 1, stat: "Running", hook: "less time standing still" },
  { src: "/feed/library/06-onboarding.webp", fit: 1, stat: "Ready", hook: "from day one" },
  { src: "/feed/library/07-energy.webp", fit: 1, stat: "Saved", hook: "energy nobody needs" },
  { src: "/feed/library/08-less-paperwork.webp", fit: 0.9, stat: "Once", hook: "entered, not twice" },
  { src: "/feed/library/09-quality.webp", fit: 1, stat: "Right", hook: "first time, less scrap" },
  { src: "/feed/library/10-parts-in-stock.webp", fit: 1, stat: "Stocked", hook: "parts there when needed" },
];

export type SampleCover = CoverPic & { title: string; text: string };

// The dev panel's "Fill a sample idea" (lib/dev-fill.ts DEV_SAMPLES): its title and how its text
// starts, with the picture made for it.
export const SAMPLE_COVERS: readonly SampleCover[] = [
  { title: "A reporting screen at each assembly station", text: "We should put a simple reporting screen at each assembly station so operators can flag recurring problems", src: "/feed/sample-reporting-screen.webp", fit: 1, stat: "Seen", hook: "problems followed up" },
];

// A sample idea by its title, or by how its text starts -
// the draft can be renamed, the text it was filled with stays at the top of the body.
export function sampleCoverFor(c: { title: string; body: string }, samples: readonly SampleCover[] = SAMPLE_COVERS): CoverPic | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const t = norm(c.title), b = norm(c.body);
  const hit = samples.find((x) => {
    const head = norm(x.text).slice(0, 60);
    return t === norm(x.title) || t.startsWith(head) || b.startsWith(head);
  });
  return hit ? { src: hit.src, fit: hit.fit, stat: hit.stat, hook: hit.hook } : null;
}

// Stable per case: the same id always lands on the same picture.
export function libraryCoverFor(id: string, library: readonly CoverPic[] = COVER_LIBRARY): CoverPic | null {
  if (!library.length) return null;
  return library[[...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % library.length];
}
