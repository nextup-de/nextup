// May the assistant answer for this company right now, and with which provider? Pure; the route
// asks this before anything else. Fail closed: every "no" names the switch that is missing.
//
//   demo stage   our made-up content: on, with whatever provider the server has.
//   real stages  the admin's switch must be on; sending to a model outside the app (bedrock) also
//                needs the signed data-processing agreement AND a database, so every turn is audited.
//   no database  the local demo: the mock only - nothing leaves the machine without an audit trail.
import { policyFor } from "@/features/admin/stages";

export type Gate = { on: true; provider: "bedrock" | "mock" } | { on: false; why: string };

export function assistGate(a: {
  stage: string;
  hasDatabase: boolean;
  configured: "bedrock" | "mock";
  enabled: boolean;
  dpaSignedAt: Date | null;
}): Gate {
  const demo = policyFor(a.stage).demoData;
  if (!a.hasDatabase) return demo ? { on: true, provider: "mock" } : { on: false, why: "The assistant needs the database for its audit trail." };
  if (demo) return { on: true, provider: a.configured };
  if (!a.enabled) return { on: false, why: "The assistant is switched off for this company." };
  if (a.configured === "bedrock" && !a.dpaSignedAt) return { on: false, why: "The assistant waits for the data-processing agreement." };
  return { on: true, provider: a.configured };
}
