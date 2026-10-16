// "Export" from the last look before publishing (components/ideas/RaiseExport.tsx, Claude Design handoffs
// "Export button" and "Export view"): the idea as plain text to copy, and as an A4 HTML document to print
// as PDF or save as a .doc. All read the same parts: what the author wrote and chose, plus NextUp's
// assessment only when "AI analysis" is switched on.

export type ExportIdea = {
  kind: "idea" | "problem";
  title: string;
  summary: string;
  context: string;
  affected: readonly string[];
  coll: readonly string[];
  meet: { dur: string; when: string } | null;
  prompts: readonly { label: string; text: string }[];
  author: string;
  meta?: string; // "J. Schmidt · Production · 16 October 2026" - the document's byline
  receiver?: string; // "Goes to …"
  analysis?: ExportAnalysis | null; // included only when the author switches "AI analysis" on
};

// NextUp's assessment as the export shows it: the advice, why, the mean of the five scores and each score
// ("–" where nothing was scored yet).
export type ExportAnalysis = { rec: string; why: string; overall: number; scores: readonly { label: string; val: string }[] };

export type ExportParts = { kind: string; title: string; summary: string; ctx: string; rows: [string, string][] };

// The labelled rows in order - who it affects, who it was raised with, the meeting, then each filled
// line ("Note" where it has no label) - leaving out the empty ones.
export function exportParts(d: ExportIdea): ExportParts {
  const rows: [string, string][] = [
    ["Affects", d.affected.join(", ")],
    ["Raised with", d.coll.join(", ")],
    ["Requested meeting", d.meet ? d.meet.dur + ", " + d.meet.when : ""],
    ...d.prompts.filter((p) => p.text.trim()).map((p): [string, string] => [p.label.trim() || "Note", p.text.trim()]),
  ];
  return {
    kind: d.kind === "problem" ? "Problem" : "Idea", title: d.title.trim() || "Untitled", summary: d.summary.trim(), ctx: d.context.trim(),
    rows: rows.filter((r) => r[1]),
  };
}

export function exportText(d: ExportIdea): string {
  const p = exportParts(d), an = d.analysis;
  return [p.kind + ": " + p.title, "", p.summary, ...(p.ctx ? ["", "Context", p.ctx] : []), "", ...p.rows.map((r) => r[0] + ": " + r[1]),
    ...(an ? ["", "Assessment (Nextup): " + an.rec + " · " + an.overall + "/100", an.why, an.scores.map((x) => x.label + " " + x.val).join(" · ")] : []),
    "", "Raised by " + d.author]
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

// The A4 page of the export view (RaiseExport.tsx) as a document of its own: eyebrow, title, byline, rule,
// then summary, context, details and - when on - the assessment, in black and white.
export function exportHtml(d: ExportIdea): string {
  const p = exportParts(d), an = d.analysis;
  const sec = (label: string, body: string) => '<div class="s"><div class="l">' + label + "</div>" + body + "</div>";
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(p.title) + "</title><style>" +
    "@page{size:A4;margin:20mm}body{font-family:Inter,Helvetica,Arial,sans-serif;color:#1c1c1e;max-width:640px;margin:48px auto;padding:0 24px;line-height:1.6}" +
    ".k{font-size:11px;font-weight:600;color:#1f7a3a;text-transform:uppercase;letter-spacing:.08em}h1{font-size:28px;font-weight:600;line-height:1.2;margin:8px 0 0;letter-spacing:-.02em;color:#1b1d22}" +
    ".m{font-size:14px;color:#6e6e73;margin-top:6px}.m b{font-weight:600;color:#3a3a3c}hr{border:none;height:2px;background:#1c1c1e;margin:22px 0 24px}" +
    ".s{margin-top:24px}.s:first-of-type{margin-top:0}.l{font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}" +
    "p{margin:0}table{border-collapse:collapse;width:100%}td{padding:10px 0;border-bottom:1px solid #ececf0;font-size:14px;vertical-align:top}td:first-child{color:#6e6e73;font-size:13px;width:150px}" +
    ".r{display:inline-block;font-size:13px;font-weight:600;background:#f2f2f7;border-radius:999px;padding:3px 10px;margin-right:10px}.sc td{width:20%;border-top:1px solid #ececf0;font-size:12px;color:#6e6e73}.sc b{display:block;font-size:18px;color:#1c1c1e}" +
    ".c{font-size:12px;color:#8e8e93;margin-top:10px}.f{margin-top:32px;font-size:12px;color:#8e8e93;display:flex;justify-content:space-between}" +
    "</style></head><body>" +
    '<div class="k">' + esc(p.kind) + " · Final</div><h1>" + esc(p.title) + "</h1>" +
    (d.meta ? '<div class="m">' + esc(d.meta) + "</div>" : "") + (d.receiver ? '<div class="m">Goes to <b>' + esc(d.receiver) + "</b></div>" : "") + "<hr>" +
    sec("Summary", "<p>" + esc(p.summary) + "</p>") +
    (p.ctx ? sec("Context", "<p>" + esc(p.ctx) + "</p>") : "") +
    (p.rows.length ? sec("Details", "<table>" + p.rows.map((r) => "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>").join("") + "</table>") : "") +
    (an ? sec("Assessment · by Nextup", '<p><span class="r">' + esc(an.rec) + "</span>" + esc(an.why) + '</p><table class="sc"><tr>' +
      an.scores.map((x) => "<td>" + esc(x.label) + "<b>" + esc(x.val) + "</b></td>").join("") + '</tr></table><div class="c">Overall ' + an.overall + " / 100 · generated by Nextup, not edited by the author</div>") : "") +
    '<div class="f"><span>Raised by ' + esc(d.author) + " via Nextup</span><span>Page 1 of 1</span></div></body></html>";
}

// The .doc's file name: the title without anything but word characters, "-" and spaces, at most 60 long.
export const exportFileName = (title: string) => (title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "idea") + ".doc";
