"use server";
// The hint on a no's reason (plan AGT, D24, D25): under the No sheet's reason field a quiet link checks the reason with the brain's /v1/hint. Only for
// the desk of the case or a manager, with the flag `agent` on and the AI gate open for purpose `brain`. The category and the reason go out redacted with
// the idea's title; nothing is stored, nothing blocks or changes the no, and any failure is null, which the sheet shows as nothing. Never throws.
import { onDeskOf } from "@/features/cases/selectors";
import { localeForUser } from "@/i18n/server";
import { askBrainHint } from "./brain";
import { caseContext, type CaseContext } from "./case-context";
import { agentGateFor } from "./gate";

/** The desk and managers; the same people who may answer the case. */
const mayHint = (c: CaseContext): boolean => c.viewer.role === "manager" || onDeskOf(c.kase, c.viewer.me);

/** Is the hint there for this viewer on this case? The sheet shows the link only when it is. */
export async function reasonHintAvailableAction(slug: string, caseId: string): Promise<boolean> {
  try {
    const c = await caseContext(slug, caseId);
    return !!c && mayHint(c) && (await agentGateFor(c.companyId, slug, "brain")).gate.on;
  } catch {
    return false;
  }
}

/** `{ ok: true }`: the reason looks clear. `{ hint }`: one sentence to add. Null: nothing to say, or any failure. */
export async function reasonHintAction(slug: string, caseId: string, category: string, reason: string): Promise<{ ok: true } | { hint: string } | null> {
  try {
    if (typeof category !== "string" || typeof reason !== "string" || category.length > 80) return null;
    const text = reason.trim().slice(0, 2000);
    if (text === "") return null;
    const c = await caseContext(slug, caseId);
    if (!c || !mayHint(c)) return null;
    const gate = await agentGateFor(c.companyId, slug, "brain");
    if (!gate.gate.on) return null;
    const locale = await localeForUser(c.companyId, c.viewer.userId ?? "");
    const answer = await askBrainHint(gate.gate, slug, { idea: c.kase.title, category, reason: text, locale }, gate.policy, { key: gate.key, companyId: c.companyId });
    if (!answer) return null;
    const hint = answer.hint.trim();
    return answer.ok || hint === "" ? { ok: true } : { hint };
  } catch (err) {
    console.error("[agent]", "hint failed:", err instanceof Error ? err.name : "error");
    return null;
  }
}
