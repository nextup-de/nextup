"use server";
// A KPI file becomes the measure of an open check (LOOP/D19). The file's text is read and dropped:
// the event keeps its name, its sha256 and its row count, nothing else. Hash and name identify the
// file only - they prove neither the numbers nor where the file came from, so the measure stays
// unconfirmed until a second person confirms it (D18).
import { createHash } from "node:crypto";
import { getViewerFor } from "@/features/auth/session";
import { newId } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { parseKpiCsv, pickForCheck } from "@/features/projects/measure-import";
import { loadLogForSlug } from "@/lib/db/events";
import { appendEventAction } from "./events";

export type ImportCode = "too-large" | "no-rows" | "no-metric" | "not-allowed" | "closed-check";
export type ImportOutcome = { ok: true; value: number; date: string } | { ok: false; code: ImportCode };

const MAX_BYTES = 1024 * 1024;

export async function importMeasuresAction(
  slug: string,
  projectId: string,
  check: number,
  file: { name: string; text: string },
): Promise<ImportOutcome> {
  if (Buffer.byteLength(file.text, "utf8") > MAX_BYTES) return { ok: false, code: "too-large" };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, code: "not-allowed" };

  const log = await loadLogForSlug(slug);
  if (!log) return { ok: false, code: "not-allowed" };
  const state = reduce(await seedFor(slug), log);
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return { ok: false, code: "not-allowed" };

  const { rows } = parseKpiCsv(file.text);
  if (rows.length === 0) return { ok: false, code: "no-rows" };
  const metric = project.baseline && !project.baseline.none ? project.baseline.metric : null;
  const picked = metric ? pickForCheck(rows, metric) : null;
  if (!picked) return { ok: false, code: "no-metric" };

  const sha256 = createHash("sha256").update(file.text, "utf8").digest("hex");
  const result = await appendEventAction({
    slug,
    id: newId("e"),
    type: "project.measured",
    target: projectId,
    payload: { check, value: picked.value, source: { kind: "import", file: file.name.slice(0, 200), sha256, rows: rows.length } },
  });
  if (result.ok) return { ok: true, value: picked.value, date: picked.date };

  const c = project.checks.find((x) => x.check === check);
  const open = c !== undefined && !c.measured && state.day >= c.opensDay;
  return { ok: false, code: open ? "not-allowed" : "closed-check" };
}
