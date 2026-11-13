// The usage ledger of every model call (plan AGT, D21 and the review of 12 Nov; plan REM: the brain's calls use it as the agent's do): what a model call costs is counted from AiCall rows, and a row of a finished
// call is written only after the answer. Calls that run side by side (the daily run, a planning run, a hint) would all pass the gate's check
// of the rows written so far, so an agent call is RESERVED first: under a lock per company, the estimated maximum cost is added to the month's
// spend; when it would use the cap up, no call is made (fail closed). The reservation is an AiCall row of its own purpose with the estimate,
// so every gate check that follows counts it at once. After the call the row is
//   - settled: the provider's reported model and tokens replace the estimate (a successful answer, or a failed or invalid one that carries counts),
//   - released: the brain refused before any model ran (a 4xx), nothing was billed, the row goes,
//   - kept: usage is unknown (timeout, disconnect, a failure without counts). The estimate stays as the month's cost and the call is logged as
//     "usage unknown", never silently counted as free.
// The cap is therefore a ceiling on what is reserved, not a hard monetary guarantee: a model that bills more than the estimate's maximum is not
// capped by it. The proof is tests/db/agt-daily.test.ts, "reserves ..." (concurrent reservations against a nearly used up cap).
// Not a "use server" module.
import { releaseAiCall, reserveAiCall, settleAiCall, type AiEstimate } from "@/lib/db/ai-usage";

/** What a call may use at most, before it is made. */
export type Estimate = AiEstimate;
/** What the provider reported. */
export type Settlement = { model: string; tokensIn: number; tokensOut: number; latencyMs: number };
/** Why the usage of a call is not known. */
export type Unknown = "timeout" | "disconnect" | "server-error" | "unreadable";

export type Reservation = {
  settle(s: Settlement): Promise<void>;
  release(): Promise<void>;
  keep(latencyMs: number, why: Unknown): Promise<void>;
};
export type Ledger = {
  /** A reservation, or null when the estimate would use the month's cap up: then no call is made. Never throws: a ledger that cannot be written is a closed one. */
  reserve(companyId: string, purpose: string, estimate: Estimate, now?: Date): Promise<Reservation | null>;
};

async function warnAfter(companyId: string): Promise<void> {
  try {
    const { warnAiBudget } = await import("@/server/notify/ai-budget");
    await warnAiBudget(companyId);
  } catch (err) {
    console.warn("[ai] budget warning not checked", err instanceof Error ? err.name : "failed");
  }
}

/** The ledger on the database: the reservations and their settlement are stored by lib/db/ai-usage.ts, the first and the last step are this one's (the warning mail). */
export const dbLedger: Ledger = {
  async reserve(companyId, purpose, estimate, now = new Date()) {
    try {
      const id = await reserveAiCall(companyId, purpose, estimate, now);
      if (id === null) return null;
      return {
        async settle(s) {
          await settleAiCall(companyId, id, { model: s.model || estimate.model, tokensIn: s.tokensIn, tokensOut: s.tokensOut, latencyMs: s.latencyMs });
          await warnAfter(companyId);
        },
        async release() {
          await releaseAiCall(companyId, id);
        },
        async keep(latencyMs, why) {
          console.warn("[ai] usage unknown (" + why + "), the estimate stays counted:", purpose, estimate.tokensIn + "+" + estimate.tokensOut, "tokens");
          await settleAiCall(companyId, id, { latencyMs });
          await warnAfter(companyId);
        },
      };
    } catch (err) {
      console.error("[ai] usage not reserved, no call", err instanceof Error ? err.name : "failed");
      return null;
    }
  },
};
