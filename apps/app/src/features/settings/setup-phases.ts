// The setup overview: every phase, who owns it, how far it is. Pure: server/setup-overview.ts reads the
// facts on every load, this file decides. Nothing here is stored. Each line names a message and its
// values, and the sentence is built at render. Times are ISO strings; the component formats them.
import type { MessageKey } from "@/i18n";
import type { ConnectorStatus } from "@/features/connectors/status";
import { blockers, goLiveChecks, type CheckKey, type GoLiveCheck, type GoLiveInput, type LineValues } from "@/features/pilot/go-live";
import { SYSTEM_NAME, type Declinable, type Declined } from "./declined";
import type { HandOver } from "./hand-over";
import { setupStep, type SetupCounts, type SetupStep } from "./sections";

export type PhaseKey = "server" | "signIn" | "connectors" | "context" | "company" | "open";
export type PhaseStatus = "done" | "yourTurn" | "waiting" | "problem" | "notUsed";
export type PhaseOwner = "nextupAndIt" | "customerIt" | "system" | "pilotLead" | "customerAdmin";

/** The context run's state, as server/setup-context.ts reports it. */
export type ContextStatus = "notUsed" | "idle" | "running" | "ready" | "failed";

/**
 * Who is looking. A manager works the company phases, a stack admin the IT phases, someone who is both
 * works all of them. `console` is /admin/setup: it reads everything and acts on nothing.
 */
export type SetupViewer = "manager" | "stackAdmin" | "both" | "console";

/**
 * "We do not use this" on an optional line (Q9.1): `declined` false offers it, true offers "Use it after all".
 * Only a stack admin acts on it (the phase's canAct); the console shows the line and no button.
 */
export type LineDecline = { system: Declinable; declined: boolean };
export type PhaseLine = { key: string; status: PhaseStatus; line: MessageKey; values?: LineValues; decline?: LineDecline };

export type SetupPhase = {
  key: PhaseKey;
  owner: PhaseOwner;
  status: PhaseStatus;
  /** This viewer can do something about it. Otherwise "your turn" is not theirs, and the page says so. */
  canAct: boolean;
  /** Where the work is, or null when this viewer has nowhere to go. */
  href: string | null;
  lines: PhaseLine[];
};

/** What only a one-company stack has. */
export type ItFacts = {
  /** The base of the console's paths (features/admin/nav.ts adminBase). */
  consoleBase: string;
  /** Active people flagged as stack admins. Someone with the Entra admin role is not counted. */
  admins: number;
  connectors: { m365: ConnectorStatus; jira: ConnectorStatus; ai: ConnectorStatus; directory: ConnectorStatus; teams: ConnectorStatus };
  /** What the company decided not to use (features/settings/declined.ts). */
  declined: Declined;
};

export type SetupFacts = {
  viewer: SetupViewer;
  /** The company's address part (features/tenant/urls.ts companyPrefix). */
  prefix: string;
  goLive: GoLiveInput;
  /** Null on a multi-tenant stack: it has no console, so the IT phases do not show. */
  it: ItFacts | null;
  counts: SetupCounts;
  openedAt: Date | null;
  context: ContextStatus;
  /** The customer's IT confirmed the hand-over on /admin/setup (Q8.6); absent or null while it has not. */
  handedOver?: HandOver | null;
};

const canAct = (viewer: SetupViewer, side: "it" | "company") =>
  viewer === "both" || viewer === (side === "it" ? "stackAdmin" : "manager");

/** The worst line decides: a problem beats your turn, your turn beats waiting. */
function rollUp(lines: readonly PhaseLine[]): PhaseStatus {
  for (const s of ["problem", "yourTurn", "waiting"] as const) if (lines.some((l) => l.status === s)) return s;
  return lines.some((l) => l.status === "done") ? "done" : "notUsed";
}

function check(checks: readonly GoLiveCheck[], key: CheckKey): GoLiveCheck {
  const found = checks.find((c) => c.key === key);
  if (!found) throw new Error(`no go-live check ${key}`);
  return found;
}

/** A line that says what the go-live page says about the same thing. */
const fromCheck = (key: string, status: PhaseStatus, c: GoLiveCheck): PhaseLine => ({ key, status, line: c.line, values: c.values });

/**
 * An optional line that is not in use: the decision when there is one, else the line as it is with the offer
 * to decide. A system that is on never gets here, so a decision against it no longer shows once it is on.
 */
function unused(it: ItFacts, system: Declinable, line: PhaseLine): PhaseLine {
  const d = it.declined[system];
  return d
    ? { key: line.key, status: "notUsed", line: "settingsSetupPhases.lineDeclined", values: { systemKey: SYSTEM_NAME[system], date: d.at, reason: d.reason }, decline: { system, declined: true } }
    : { ...line, decline: { system, declined: false } };
}

/**
 * Phase 1. The install happens before the app runs, so this only confirms the result. A confirmed hand-over
 * adds a line that is done; it never holds the phase back, so the server phase can be checked before it.
 */
function serverLines(input: GoLiveInput, checks: readonly GoLiveCheck[], handedOver: HandOver | null): PhaseLine[] {
  const backup = check(checks, "backups");
  const handOver: PhaseLine[] = handedOver
    ? [{
      key: "handedOver", status: "done",
      line: handedOver.by === "entra" ? "settingsSetupPhases.lineHandedOverEntra" : "settingsSetupPhases.lineHandedOverStackAdmin",
      values: { date: handedOver.at.toISOString() },
    }]
    : [];
  return [
    { key: "app", status: "done", line: "settingsSetupPhases.lineAppUp" },
    fromCheck("mail", input.mail === "ok" ? "done" : input.mail === "notConfigured" ? "yourTurn" : "problem", check(checks, "mail")),
    // No report yet is the normal first day. A report that says something is wrong is not.
    backup.state === "done" ? fromCheck("backup", "done", backup)
      : input.backup === null ? { key: "backup", status: "waiting", line: "settingsSetupPhases.lineBackupWaiting" }
      : fromCheck("backup", "problem", backup),
    ...handOver,
  ];
}

/** Phase 2. Without Microsoft people sign in with a code, so no line here ever stops Open. */
function signInLines(input: GoLiveInput, it: ItFacts, checks: readonly GoLiveCheck[]): PhaseLine[] {
  const lines: PhaseLine[] = [
    input.microsoftOn
      ? { key: "entra", status: "done", line: "settingsSetupPhases.lineEntraOn" }
      : unused(it, "entra", { key: "entra", status: "yourTurn", line: "settingsSetupPhases.lineEntraOff" }),
  ];
  // With Microsoft on, the Entra role can open the console too, and that role is not counted here.
  if (!input.microsoftOn && it.admins < 1) lines.push({ key: "admins", status: "yourTurn", line: "settingsSetupPhases.lineNoStackAdmin" });
  const directory = check(checks, "directory");
  if (it.connectors.directory === "off") lines.push(unused(it, "directory", { key: "directory", status: "notUsed", line: "settingsSetupPhases.lineDirectoryOff" }));
  else if (directory.state === "done") lines.push({ key: "directory", status: "done", line: "settingsSetupPhases.lineDirectoryDone", values: directory.values });
  else if (it.connectors.directory === "on" && !input.directory?.lastOkAt) lines.push({ key: "directory", status: "waiting", line: "settingsSetupPhases.lineDirectoryWaiting" });
  else lines.push({ key: "directory", status: "problem", line: "settingsSetupPhases.lineDirectoryProblem" });
  return lines;
}

/**
 * Phase 3. Each connector is optional, and off is a choice. Something still has to be decided while nothing is
 * on and a system that is off has no decision yet (Q9.1).
 */
function connectorLines(input: GoLiveInput, it: ItFacts, checks: readonly GoLiveCheck[]): PhaseLine[] {
  const { m365, jira, ai, teams } = it.connectors;
  const lines: PhaseLine[] = [
    // "needs" here is a precondition (Microsoft sign-in, the vault), not a request: nobody asked for it yet.
    m365 === "on" ? { key: "m365", status: "done", line: "settingsSetupPhases.lineM365On" }
      : unused(it, "m365", m365 === "needs" ? { key: "m365", status: "notUsed", line: "settingsSetupPhases.lineM365Needs" } : { key: "m365", status: "notUsed", line: "settingsSetupPhases.lineM365Off" }),
    // Teams is switched in Settings -> Microsoft Teams; while it is off every notice goes by mail.
    teams === "on" ? { key: "teams", status: "done", line: "settingsSetupPhases.lineTeamsOn" }
      : unused(it, "teams", { key: "teams", status: "notUsed", line: "settingsSetupPhases.lineTeamsOff" }),
    jira === "on" ? { key: "jira", status: "done", line: "settingsSetupPhases.lineJiraOn" }
      : jira === "error" ? { key: "jira", status: "problem", line: "settingsSetupPhases.lineJiraError" }
      : unused(it, "jira", { key: "jira", status: "notUsed", line: "settingsSetupPhases.lineJiraOff" }),
  ];
  const agreement = check(checks, "ai");
  // The model on this stack needs no key and no agreement, only the stack's brain (go-live.ts says whether it answers).
  if (input.ai.choice === "local") {
    lines.push(agreement.state === "done" ? { key: "ai", status: "done", line: "settingsSetupPhases.lineAiLocal" }
      : agreement.state === "unknown" ? { key: "ai", status: "problem", line: "settingsSetupPhases.lineAiLocalDown" }
      : { key: "ai", status: "yourTurn", line: "settingsSetupPhases.lineAiLocalNoBrain" });
  } else if (ai === "needs") lines.push({ key: "ai", status: "yourTurn", line: "settingsSetupPhases.lineAiNeedsKey" });
  // Only an AI that is really off can be declined: a test model or a missing agreement still blocks Open.
  else if (agreement.state === "done" && ai === "off") lines.push(unused(it, "ai", { key: "ai", status: "notUsed", line: "settingsSetupPhases.lineAiOff" }));
  else if (agreement.state === "done") lines.push({ key: "ai", status: "done", line: "settingsSetupPhases.lineAiOn", values: agreement.values });
  else lines.push({ key: "ai", status: "yourTurn", line: input.ai.choice === "mock" ? "settingsSetupPhases.lineAiMock" : "settingsSetupPhases.lineAiNoAgreement" });
  const undecided = lines.some((l) => l.decline && !l.decline.declined);
  if (rollUp(lines) === "notUsed" && undecided) lines.push({ key: "none", status: "yourTurn", line: "settingsSetupPhases.lineNothingConnected" });
  return lines;
}

const CONTEXT: Record<ContextStatus, { status: PhaseStatus; line: MessageKey }> = {
  notUsed: { status: "notUsed", line: "settingsSetupPhases.lineContextNotUsed" },
  idle: { status: "yourTurn", line: "settingsSetupPhases.lineContextIdle" },
  running: { status: "waiting", line: "settingsSetupPhases.lineContextRunning" },
  // The run is over. `ready` stays after the review too, so it cannot be anyone's turn for good.
  ready: { status: "done", line: "settingsSetupPhases.lineContextReady" },
  failed: { status: "problem", line: "settingsSetupPhases.lineContextFailed" },
};

const STEP_NAME: Record<Exclude<SetupStep, "done">, MessageKey> = {
  company: "settingsSetup.stepCompany", units: "settingsSetup.stepUnits", roles: "settingsSetup.stepRoles",
  routes: "settingsSetup.stepRoutes", members: "settingsSetup.stepMembers",
};
const STEP_ORDER = Object.keys(STEP_NAME) as (keyof typeof STEP_NAME)[];

/** The address that picks the five steps up again. Coming back to a later step says so on that page. */
export function resumeHref(prefix: string, step: SetupStep): string {
  return `${prefix}/setup/${step}${step === "company" || step === "done" ? "" : "?resume=1"}`;
}

/** Phase 6. Open comes last. A backup that is still to come is waiting, every other open check is someone's work. */
function openStatus(f: SetupFacts, step: SetupStep, open: readonly GoLiveCheck[]): PhaseLine {
  if (f.openedAt) return { key: "opened", status: "done", line: "settingsSetupPhases.lineOpened", values: { date: f.openedAt.toISOString() } };
  if (step !== "done") return { key: "steps", status: "waiting", line: "settingsSetupPhases.lineOpenAfterSteps" };
  if (open.length === 0) return { key: "ready", status: "yourTurn", line: "settingsSetupPhases.lineOpenReady" };
  if (open.every((c) => c.key === "backups") && f.goLive.backup === null) return { key: "backup", status: "waiting", line: "settingsSetupPhases.lineOpenBackup" };
  return { key: "checks", status: "yourTurn", line: "settingsSetupPhases.lineOpenChecks", values: { count: open.length } };
}

export function setupPhases(f: SetupFacts): SetupPhase[] {
  const checks = goLiveChecks(f.goLive);
  const step = setupStep(f.counts);
  const companyLink = (href: string) => (canAct(f.viewer, "company") ? href : null);
  const out: SetupPhase[] = [];

  if (f.it) {
    const it = f.it;
    // The console opens for a stack admin and, read-only, for itself. A plain manager cannot get in.
    const itLink = (path: string) => (canAct(f.viewer, "it") || f.viewer === "console" ? `${it.consoleBase}${path}` : null);
    const itPhase = (key: PhaseKey, owner: PhaseOwner, lines: PhaseLine[], path: string | null): SetupPhase =>
      ({ key, owner, lines, status: rollUp(lines), canAct: canAct(f.viewer, "it"), href: path ? itLink(path) : null });
    // Nothing in the app changes the server: the install is in the runbook, so phase 1 has no link.
    out.push(itPhase("server", "nextupAndIt", serverLines(f.goLive, checks, f.handedOver ?? null), null));
    // Each link goes to the block that has the missing thing: the tenant is on Access, the agreement on Assistant.
    out.push(itPhase("signIn", "customerIt", signInLines(f.goLive, it, checks), f.goLive.microsoftOn ? "/connectors#directory" : "/people#microsoft"));
    const needsAgreement = it.connectors.ai === "on" && check(checks, "ai").state !== "done";
    out.push(itPhase("connectors", "customerIt", connectorLines(f.goLive, it, checks), needsAgreement ? "/assistant" : "/connectors"));
  }

  const context = CONTEXT[f.context];
  out.push({
    key: "context", owner: "system", status: context.status, canAct: canAct(f.viewer, "company"),
    href: companyLink(`${f.prefix}/setup/company#context`), lines: [{ key: "context", ...context }],
  });

  const stepLine: PhaseLine = step === "done"
    ? { key: "steps", status: "done", line: "settingsSetupPhases.lineStepsDone" }
    : { key: "steps", status: "yourTurn", line: "settingsSetupPhases.lineStepNext", values: { n: STEP_ORDER.indexOf(step) + 1, total: STEP_ORDER.length, stepKey: STEP_NAME[step] } };
  out.push({
    key: "company", owner: "pilotLead", status: stepLine.status, canAct: canAct(f.viewer, "company"),
    href: companyLink(resumeHref(f.prefix, step)), lines: [stepLine],
  });

  const openLine = openStatus(f, step, blockers(checks));
  out.push({
    key: "open", owner: "customerAdmin", status: openLine.status, canAct: canAct(f.viewer, "company"),
    href: companyLink(`${f.prefix}/setup/open`), lines: [openLine],
  });
  return out;
}

/**
 * Whether the page should look again by itself. Open's waiting does not count: it waits for the five
 * steps, which are people, or for the backup, which phase 1 already waits for.
 */
export function setupIsWaiting(phases: readonly SetupPhase[]): boolean {
  return phases.some((p) => p.status === "waiting" && p.key !== "open");
}
