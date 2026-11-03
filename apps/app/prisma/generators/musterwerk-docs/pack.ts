// The AIT document pack: musterwerkDocs(seed) returns every file the quality test needs, in memory.
// Pure and deterministic: TST's seeded PRNG, no Math.random, no Date.now. docs: README.md.
import { makeRng } from "../musterwerk/rng";
import { erpFiles } from "./content/erp";
import { boardFiles, financeFiles, hrFiles, trapFile } from "./content/people";
import { decisionFiles, policyFiles } from "./content/policies";
import { processFiles } from "./content/processes";
import { protocolFiles } from "./content/protocols";
import type { PackFile } from "./manifest";

const SUFFIXES = [" - Kopie", " (v2)", " final_neu", " - Kopie (2)", " (v2) final_neu"] as const;

/** Saved-twice copies of ordinary files, as people leave them on a share: same text, a clumsy name. */
function copies(files: readonly PackFile[], seed: number): PackFile[] {
  const r = makeRng(seed).fork("copies");
  const candidates = files.filter((f) => f.channel === "m365" && ["process", "policy", "meeting", "howto", "routes", "supplier-rating"].includes(f.kind));
  return r.shuffle(candidates).slice(0, 24).map((f, i) => {
    const suffix = SUFFIXES[i % SUFFIXES.length];
    const dot = f.path.lastIndexOf(".");
    return {
      ...f,
      path: `${f.path.slice(0, dot)}${suffix}${f.path.slice(dot)}`,
      title: `${f.title}${suffix}`,
      readers: [...f.readers],
      year: Math.max(2021, f.year - r.int(0, 1)),
    };
  });
}

export function musterwerkDocs(seed: number): PackFile[] {
  const rng = makeRng(seed).fork("ait-pack");
  const base: PackFile[] = [
    ...processFiles(rng.fork("processes")),
    ...policyFiles(),
    ...decisionFiles(rng.fork("decisions")),
    ...protocolFiles(rng.fork("protocols")),
    ...hrFiles(rng),
    ...financeFiles(rng),
    trapFile(),
    ...boardFiles(rng),
    ...erpFiles(rng.fork("erp")),
  ];
  return [...base, ...copies(base, seed)];
}
