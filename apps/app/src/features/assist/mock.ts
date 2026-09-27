// A provider with no model behind it: it calls the same tools the real one would and strings the
// top results into a short answer. Used in the demo stage, in e2e and whenever no model is
// configured - so the page works, and the whole pipeline (redaction, tools, citations, audit) is
// exercised, without a network call. Deterministic.
import type { Provider } from ".";

const first = (out: string) => out.split("\n").find((l) => /^\[S\d+\]/.test(l)) ?? null;
const body = (line: string) => line.replace(/^\[S\d+\]\s*/, "").replace(/[.\s…]+$/, "");
const tagOf = (line: string) => line.match(/^\[(S\d+)\]/)?.[0] ?? "";

export const mockProvider: Provider = {
  id: "mock",
  async run(r) {
    const query = r.question;
    const [route, goal, doc] = await Promise.all([
      r.runTool("list_routes", { query }),
      r.runTool("get_goals", { query }),
      r.runTool("search_documents", { query }),
    ]);
    const lines: string[] = [];
    const d = first(doc), rt = first(route), g = first(goal);
    if (d) lines.push(`There is something written down on this: ${body(d)} ${tagOf(d)}.`);
    if (rt) {
      const [type, rest] = body(rt).split(": ");
      lines.push(`This sounds like ${type.toLowerCase()}. ${rest?.split(";")[0].replace(/^owner /, "It is owned by the ")} ${tagOf(rt)}.`);
    }
    if (g && rt) lines.push(`It touches the goal "${body(g).split(" - ")[0]}" ${tagOf(g)}.`);
    if (!lines.length) lines.push("I could not find this in the company knowledge. Raise it, so the right person picks it up.");
    else lines.push("If that does not solve it, raise it and it lands with that owner.");

    const text = lines.join(" ");
    // Stream it in sentence-sized pieces, like a model would.
    for (const piece of text.match(/[^.!?]+[.!?]+\s*/g) ?? [text]) r.onText(piece);
    return { text, model: "mock", tokensIn: 0, tokensOut: 0 };
  },
};
