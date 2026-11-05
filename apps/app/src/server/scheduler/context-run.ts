// The context run (docs/COMPANY_KNOWLEDGE.md, "The context draft"). A person starts it in setup; every
// CONTEXT_RUN_INTERVAL_MS (default 15 s) this picks up what is waiting, under a lease on the company's row:
// search the connected sources as that person, send titles and snippets to the company's model, keep the
// proposal as a draft, and mail the person. Nothing here touches CompanyProfile: people do that, on Save.
//
// Logs counts, timings and codes only: never a query's result, a snippet, a file name or the model's text.
//
// Not a "use server" module.
import { PUBLIC_CONTRACT_VERSION, type AiProvider, type KnowledgeHit, type KnowledgeSource } from "@nextup/contracts/public";
import type { AiSettings } from "@/features/ai/settings";
import { canUse, rank, type Level } from "@/features/assist/classify";
import { isAboveCeiling, redact } from "@/features/assist/redact";
import {
  CONTEXT_HITS_PER_QUERY, CONTEXT_MAX_HITS, CONTEXT_MAX_TOKENS, CONTEXT_QUERIES, CONTEXT_SYSTEM,
  cleanDraft, contextPrompt, isLink, mockContextAnswer, parseContextAnswer,
  type ContextDraft, type ContextError, type ContextHit, type ContextSource,
} from "@/features/settings/context-draft";
import { companyUrl } from "@/features/tenant/urls";
import { translate } from "@/i18n";
import { localeForUser } from "@/i18n/server";
import { recordAiCall } from "@/lib/db/ai-usage";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  claimContextRun, companiesWithContextMailDue, companiesWithRunningContext, expireContextDrafts, finishContextRun, loadContextRun, markContextMailed,
} from "@/lib/db/context-run";
import { aiProviderFor } from "@/server/ai";
import { audited } from "@/server/actions/settings/audited";
import { SYSTEM_ACTOR } from "@/server/audit/record";
import { knowledgeSourcesFor } from "@/server/connectors/knowledge";
import { mailConfigured, sendMail } from "@/server/mail";
import { contextFacts, contextUsable } from "@/server/setup-context";

/** Longer than the searches and the model together; a run that dies is picked up after this. */
const LEASE_MS = 5 * 60_000;
/** A run that keeps dying stops here instead of calling the model for ever. */
const MAX_ATTEMPTS = 3;
const DAY = 86_400_000;
/** A draft nobody looked at leaves after this; docs/compliance says so. */
const DRAFT_DAYS = 30;
/** A mail that did not go out is tried again for this long. */
const MAIL_RETRY_MS = DAY;
/** A relay that refuses is asked again this often, not on every pass. */
const MAIL_GAP_MS = 5 * 60_000;
const mailTried = new Map<string, number>();
/** The most a run reads, whatever the assistant may: a stored draft outlives the question it answers. A stricter company ceiling still wins. */
const RUN_CEILING: Level = "internal";

const intervalMs = (): number => {
  const n = Number(process.env.CONTEXT_RUN_INTERVAL_MS);
  return Number.isFinite(n) && n >= 500 ? n : 15_000;
};

/** The adapter for the choice. The mock has none of its own (server/ai): it answers from the prompt. */
export function contextProviderFor(settings: AiSettings, key: string | null): AiProvider | null {
  if (settings.choice !== "mock") return aiProviderFor(settings, key);
  return {
    info: { kind: "AiProvider", id: "mock", contractVersion: PUBLIC_CONTRACT_VERSION },
    complete: async (req) => ({ text: mockContextAnswer(req.messages[0].text), model: "mock", tokensIn: 0, tokensOut: 0 }),
  };
}

/** What differs in tests: the source and the model are never real there. */
export type ContextRunDeps = {
  sourcesFor: (companyId: string) => Promise<KnowledgeSource[]>;
  providerFor: (settings: AiSettings, key: string | null) => AiProvider | null;
  send: typeof sendMail;
};
const REAL: ContextRunDeps = { sourcesFor: knowledgeSourcesFor, providerFor: contextProviderFor, send: sendMail };

/** Every search of the run, one after the other: each is a call to Microsoft as this person. */
async function searchAll(sources: readonly KnowledgeSource[], q: { companyId: string; userId: string; ceiling: Level }): Promise<KnowledgeHit[]> {
  const hits = new Map<string, KnowledgeHit>();
  for (const source of sources) {
    for (const text of CONTEXT_QUERIES) {
      if (hits.size >= CONTEXT_MAX_HITS) break;
      const found = await source.search({ ...q, text, size: CONTEXT_HITS_PER_QUERY }).catch(() => [] as KnowledgeHit[]);
      for (const h of found) if (hits.size < CONTEXT_MAX_HITS && !hits.has(h.id)) hits.set(h.id, h);
    }
  }
  return [...hits.values()];
}

/** The people the company knows, each replaced by their role: the model sees roles, not names. */
async function peopleOf(companyId: string): Promise<{ name: string; role: string }[]> {
  const db = getDb();
  const [users, holders, roles] = await Promise.all([
    db.user.findMany({ where: { companyId }, select: { name: true } }),
    db.orgRoleHolder.findMany({ where: { companyId }, select: { name: true, roleId: true } }),
    db.orgRole.findMany({ where: { companyId }, select: { id: true, title: true } }),
  ]);
  const titles = new Map(roles.map((r) => [r.id, r.title]));
  return [
    ...holders.map((h) => ({ name: h.name, role: titles.get(h.roleId) ?? "a colleague" })),
    ...users.map((u) => ({ name: u.name, role: "a colleague" })),
  ];
}

/** One run, start to end. The draft, or why there is none; throws only when the database does. */
async function draftFor(company: { id: string; slug: string; name: string }, userId: string, deps: ContextRunDeps): Promise<{ draft: ContextDraft; hits: number } | { error: ContextError }> {
  const facts = await contextFacts(company.id);
  const sources = await deps.sourcesFor(company.id);
  if (!facts || !facts.gate.on) return { error: "gate_closed" };
  if (!contextUsable({ gate: facts.gate, sources })) return { error: "no_source" };
  const provider = deps.providerFor(facts.gate.settings, facts.key);
  if (!provider) return { error: "gate_closed" };

  const ceiling = rank(facts.assist.ceiling) < rank(RUN_CEILING) ? facts.assist.ceiling : RUN_CEILING;
  const started = Date.now();
  const found = await searchAll(sources, { companyId: company.id, userId, ceiling });
  const redaction = { people: await peopleOf(company.id), patterns: facts.assist.patterns };
  // The same rule as every other model call: redacted text only, and nothing marked above the ceiling.
  const clean = (text: string): string | null => {
    const r = redact(text, redaction);
    return isAboveCeiling(r, ceiling) ? null : r.text;
  };
  const hits: ContextHit[] = [];
  const listed: ContextSource[] = [];
  for (const h of found) {
    const title = clean(h.title);
    const snippet = clean(h.snippet);
    if (title === null || snippet === null || !canUse(h.classification, ceiling) || !isLink(h.url)) continue;
    const id = `S${hits.length + 1}`;
    hits.push({ id, title, snippet });
    listed.push({ id, title, url: h.url });
  }
  console.info(`[context-run] ${company.slug}: ${hits.length} of ${found.length} hits usable after ${Date.now() - started}ms`);
  if (hits.length === 0) return { error: "no_hits" };

  const asked = Date.now();
  let text: string;
  try {
    const answer = await provider.complete({
      companyId: company.id, purpose: "brain", system: CONTEXT_SYSTEM,
      messages: [{ role: "user", text: contextPrompt(clean(company.name) ?? company.slug, hits) }],
      maxTokens: CONTEXT_MAX_TOKENS,
    });
    text = answer.text;
    recordAiCall(company.id, { purpose: "context", model: answer.model, tokensIn: answer.tokensIn, tokensOut: answer.tokensOut, latencyMs: Date.now() - asked });
  } catch (err) {
    console.warn(`[context-run] ${company.slug}: the model failed after ${Date.now() - asked}ms:`, err instanceof Error ? err.name : "error");
    return { error: "model_failed" };
  }
  const parsed = parseContextAnswer(text, listed);
  const draft = parsed && cleanDraft(parsed, clean);
  return draft ? { draft, hits: hits.length } : { error: "bad_answer" };
}

/** The end of a run and its audit row, in one transaction: counts and a code, never text. */
async function finish(companyId: string, end: { draft: ContextDraft; hits: number } | { error: ContextError }, now: Date): Promise<void> {
  const changes = "draft" in end
    ? { status: { before: "running", after: "ready" }, proposed: { before: 0, after: Object.keys(end.draft.fields).length }, hits: { before: 0, after: end.hits } }
    : { status: { before: "running", after: "failed" }, error: { before: null, after: end.error } };
  await audited(
    companyId,
    (ended: boolean) => (ended ? { actor: SYSTEM_ACTOR, action: "audit.company.context_finished", target: { kind: "company", id: companyId }, changes, source: "scheduler" } : null),
    (tx) => finishContextRun(companyId, "draft" in end ? { draft: end.draft } : { error: end.error }, now, tx),
  );
}

/** Tell the starter, in their language. Only that it finished and where to look: never what it found. */
async function mailStarter(company: { id: string; slug: string; name: string }, deps: ContextRunDeps, now: Date): Promise<void> {
  const tried = mailTried.get(company.id);
  if (tried !== undefined && now.getTime() - tried < MAIL_GAP_MS) return;
  const run = await loadContextRun(company.id);
  if (!run || run.status === "running") return;
  const user = await getDb().user.findFirst({ where: { id: run.startedById, companyId: company.id }, select: { email: true, active: true } });
  // Nobody to tell, or no relay on this stack: trying again changes nothing.
  if (!user?.email || !user.active || (deps.send === sendMail && !mailConfigured())) {
    await markContextMailed(company.id, now);
    return;
  }
  mailTried.set(company.id, now.getTime());
  const locale = await localeForUser(company.id, run.startedById);
  const ready = run.status === "ready";
  const vars = { company: company.name, url: `${companyUrl(company.slug)}/setup/company#context` };
  const sent = await deps.send({
    to: user.email,
    subject: translate(locale, ready ? "settingsSetupContext.mailReadySubject" : "settingsSetupContext.mailFailedSubject", vars),
    text: translate(locale, ready ? "settingsSetupContext.mailReadyText" : "settingsSetupContext.mailFailedText", vars),
  });
  if (sent.ok) {
    await markContextMailed(company.id, now);
    mailTried.delete(company.id);
  } else {
    console.warn(`[context-run] ${company.slug}: mail not sent`);
  }
}

export type ContextRunResult = { slug: string; status: "ready" | "failed" | "skipped"; error?: ContextError };

/**
 * One pass: finish what is waiting, tell whoever waits, clear old drafts. A company whose lease another run holds
 * is skipped; one that fails never stops the others. Never throws.
 */
export async function runContextOnce(now: Date = new Date(), deps: ContextRunDeps = REAL): Promise<ContextRunResult[]> {
  const out: ContextRunResult[] = [];
  try {
    for (const company of await companiesWithRunningContext()) {
      try {
        const claim = await claimContextRun(company.id, LEASE_MS, now);
        if (!claim) {
          out.push({ slug: company.slug, status: "skipped" });
          continue;
        }
        const end = claim.attempts > MAX_ATTEMPTS ? ({ error: "interrupted" } as const) : await draftFor(company, claim.startedById, deps);
        await finish(company.id, end, now);
        mailTried.delete(company.id);
        out.push("draft" in end ? { slug: company.slug, status: "ready" } : { slug: company.slug, status: "failed", error: end.error });
      } catch (e) {
        // The lease stays: the next pass after it runs out tries again, up to MAX_ATTEMPTS.
        console.warn(`[context-run] ${company.slug}:`, e instanceof Error ? e.name : "error");
      }
    }
    for (const company of await companiesWithContextMailDue(new Date(now.getTime() - MAIL_RETRY_MS))) {
      await mailStarter(company, deps, now).catch((e: unknown) => console.warn(`[context-run] ${company.slug}: mail:`, e instanceof Error ? e.name : "error"));
    }
    const expired = await expireContextDrafts(new Date(now.getTime() - DRAFT_DAYS * DAY));
    if (expired > 0) console.info(`[context-run] cleared ${expired} old drafts`);
  } catch (e) {
    console.warn("[context-run] run:", e instanceof Error ? e.name : "error");
  }
  return out;
}

const g = globalThis as unknown as { __nextupContextRun?: ReturnType<typeof setInterval>; __nextupContextRunBusy?: boolean };

async function tick(): Promise<void> {
  if (g.__nextupContextRunBusy) return;
  g.__nextupContextRunBusy = true;
  try {
    await runContextOnce();
  } finally {
    g.__nextupContextRunBusy = false;
  }
}

/** Start the loop from instrumentation.ts. Idempotent; a no-op without a database. */
export function startContextRuns(): void {
  if (!hasDatabase() || g.__nextupContextRun) return;
  g.__nextupContextRun = setInterval(() => void tick(), intervalMs());
  void tick();
}
