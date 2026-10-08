// The dev panel's "Fill a sample idea": the raise page registers a filler while its start view is
// open, the dev panel (components/shell/DevPanel.tsx) shows the row only then and calls it. A tiny
// store so the shell and the page never import each other. Demo tooling only.

export type DevSample = {
  text: string; // the one-line headline
  ctx: string; // what more there is to say: it follows the headline in the composer
  aff: string[]; // affected departments or people
  files: string[]; // fake attachment names
};

// From the Raise handoff (design_handoff_raise/dev-autofill-samples.json), all phrased as ideas.
export const DEV_SAMPLES: DevSample[] = [
  {
    text: "A second label printer at packing station 4", aff: ["Production", "J. Klein"], files: ["printer-downtime-sept.xlsx", "jam-photo.jpg"],
    ctx: "The only printer at station 4 jams almost every morning between 6:00 and 7:00. Someone has to open it, clear the roll and recalibrate, and the whole line waits for labels in the meantime. A second printer on standby would let us switch over in a minute.\nImpact: About 40 minutes of line stop a day, roughly 160 hours a year\nCost: A matching printer is around €1,200\nAlready tried: Cleaning the rollers weekly. It helps for a day, then it jams again",
  },
  {
    text: "A broken-pallet log for the night shift", aff: ["Production", "Quality"], files: ["broken-pallets-log.pdf"],
    ctx: "A short form on the rack-end tablet where the night shift logs a broken pallet and tags it. The morning crew sees the list at handover and pulls those pallets before picking starts. Today they are set aside with no record, and by morning they are often back in the rack.\nSafety: One near miss in August, reported by the morning crew\nWho’s blocked: Forklift drivers on the early shift",
  },
  {
    text: "Reuse inbound cartons for outbound packing", aff: ["Ops & Admin", "Production", "R. Nowak"], files: ["carton-sizes.xlsx", "trial-photos.pdf"],
    ctx: "We buy new boxes every month while the cartons our parts arrive in go straight to the baler. Most of them are the same three sizes we ship in. A small sorting rack at goods-in would be enough to start.\nImpact: Around €4k a month on new boxes, plus less waste\nTrial: Line 2 tried it for one week and reused 60% of inbound cartons\nDeadline: Before the Q4 budget review",
  },
  {
    text: "Two more forklift chargers at Dock 3", aff: ["Production", "Engineering", "T. Vogel"], files: ["dock3-charger-layout.png"],
    ctx: "Add two chargers at Dock 3 so every forklift can charge at the same time. Today there are two chargers for six forklifts: drivers queue at every shift start and maintenance moves chargers around to make it work.\nImpact: 20 to 30 minutes lost per shift, three shifts a day\nSpace: Dock 3 has room for two more chargers within the safety clearance",
  },
];

let filler: (() => void) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

// Returns the unregister function, so it can be an effect's cleanup.
export function registerDevFill(fn: () => void): () => void {
  filler = fn; emit();
  return () => { if (filler === fn) { filler = null; emit(); } };
}
export const subscribeDevFill = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const hasDevFill = () => filler !== null;
export const devFill = () => filler?.();
