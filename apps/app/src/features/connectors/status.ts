// One word per connector for the console's Connectors page: on, off, needs you, or error. Pure: the
// facts the page already reads in, the status out. It never looks at a key, only whether one is set.
import type { BrainState } from "@/features/ai/settings";

export type ConnectorStatus = "on" | "off" | "needs" | "error";

/** Jira: an error counts only while the sync is on; off is a choice, not a problem. */
export function jiraStatus(f: { on: boolean; lastError: string | null }): ConnectorStatus {
  if (!f.on) return "off";
  return f.lastError ? "error" : "on";
}

/** Microsoft 365 search needs Microsoft sign-in and the vault before it can be switched on. */
export function m365Status(f: { on: boolean; microsoft: boolean; vault: boolean }): ConnectorStatus {
  if (!f.microsoft || !f.vault) return "needs";
  return f.on ? "on" : "off";
}

/**
 * The AI provider: off (keywords only), or a hosted provider that still lacks its key. The model on this stack needs
 * no key but the stack's brain: none is for the operator to add, one that does not answer is an error.
 */
export function aiStatus(f: { choice: string; key: "set" | "not set"; vault: boolean; brain?: BrainState }): ConnectorStatus {
  if (f.choice === "off" || f.choice === "mock") return "off";
  if (f.choice === "local") return f.brain === "ok" ? "on" : f.brain === "down" ? "error" : "needs";
  const hosted = f.choice === "azure-openai" || f.choice === "openai-compatible";
  if (hosted && (f.key !== "set" || !f.vault)) return "needs";
  return "on";
}

/** Teams works only with the switch on, the stack's bot set up and the company's tenant known (as dispatch decides). */
export function teamsStatus(f: { on: boolean; app: boolean; tenant: boolean }): ConnectorStatus {
  return f.on && f.app && f.tenant ? "on" : "off";
}

/** The directory sync is switched by NextUp's team; here it is only on, off or failing. */
export function directoryStatus(f: { on: boolean; lastError: string | null }): ConnectorStatus {
  if (!f.on) return "off";
  return f.lastError ? "error" : "on";
}
