// The dev panel's "Fill a sample idea": the raise page registers a filler while its start view is
// open, the dev panel (components/shell/DevPanel.tsx) shows the row only then and calls it. A tiny
// store so the shell and the page never import each other. Demo tooling only.

export type DevSample = {
  kind: "idea" | "prob"; // idea = improvement, prob = problem report
  text: string; // the one-line headline
  ctx: string; // the "Add context" text; *Label* lines match the prompt chips
  aff: string[]; // affected departments or people
  files: string[]; // fake attachment names
};

// From the Raise handoff (design_handoff_raise/dev-autofill-samples.json).
export const DEV_SAMPLES: DevSample[] = [
  {
    kind: "idea", text: "A second label printer at packing station 4", aff: ["Production", "J. Klein"], files: ["printer-downtime-sept.xlsx", "jam-photo.jpg"],
    ctx: "The only printer at station 4 jams almost every morning between 6:00 and 7:00. Someone has to open it, clear the roll and recalibrate, and the whole line waits for labels in the meantime. A second printer on standby would let us switch over in a minute.\n*Impact* About 40 minutes of line stop a day, roughly 160 hours a year\n*Cost* A matching printer is around €1,200\n*Already tried* Cleaning the rollers weekly. It helps for a day, then it jams again",
  },
  {
    kind: "prob", text: "Night shift has no way to report broken pallets", aff: ["Production", "Quality"], files: ["broken-pallets-log.pdf"],
    ctx: "When the night shift finds a broken pallet, they set it aside, but there is nowhere to log it. By morning it is often back in the rack. Last month a pallet gave way during picking.\n*Safety* One near miss in August, reported by the morning crew\n*Who’s blocked* Forklift drivers on the early shift",
  },
  {
    kind: "idea", text: "Reuse inbound cartons for outbound packing", aff: ["Ops & Admin", "Production", "R. Nowak"], files: ["carton-sizes.xlsx", "trial-photos.pdf"],
    ctx: "We buy new boxes every month while the cartons our parts arrive in go straight to the baler. Most of them are the same three sizes we ship in. A small sorting rack at goods-in would be enough to start.\n*Impact* Around €4k a month on new boxes, plus less waste\n*Trial* Line 2 tried it for one week and reused 60% of inbound cartons\n*Deadline* Before the Q4 budget review",
  },
  {
    kind: "prob", text: "Forklift chargers at Dock 3 are full at every shift start", aff: ["Production", "Engineering", "T. Vogel"], files: ["dock3-charger-layout.png"],
    ctx: "There are two chargers for six forklifts. At every shift start the drivers queue, and maintenance moves chargers around to make it work.\n*Impact* 20 to 30 minutes lost per shift, three shifts a day\n*Space* Dock 3 has room for two more chargers within the safety clearance",
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
