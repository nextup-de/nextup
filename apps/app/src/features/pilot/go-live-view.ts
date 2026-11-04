// What the Go-live page shows per stage (PIL-B1). Pure: the stage, the checks and the reminders switch in,
// the track, the meaning rows, the switch and the dialog lines out. No rule lives here: the server decides
// (moveStageAction), so a switch shown here is a courtesy and a refusal there is the answer.
import type { MessageKey } from "@/i18n";
import { blockers, type GoLiveCheck } from "./go-live";

export type TrackStage = "sandbox" | "pilot" | "live";
export type TrackStep = { stage: TrackStage; label: MessageKey; state: "past" | "current" | "next" | "later" };
export type MeaningRow = { label: MessageKey; values: Record<TrackStage, MessageKey> };
export type Line = { key: MessageKey; values?: Record<string, string | number> };
export type SwitchView = {
  to: "pilot" | "sandbox";
  label: MessageKey;
  /** Only the move to pilot waits for checks. */
  disabled: boolean;
  /** Needed checks still open (the hint under a disabled button). */
  open: number;
  dialog: { title: MessageKey; lines: Line[]; confirm: MessageKey; danger: boolean };
};
export type GoLiveView =
  | { kind: "demo" }
  | {
      kind: "stage";
      stage: TrackStage;
      track: TrackStep[];
      meaning: MeaningRow[];
      checklistTitle: MessageKey;
      needed: { done: number; total: number };
      recommended: { done: number; total: number };
      switch: SwitchView | null;
      /** The line for a company in pilot: NextUp moves it to live. */
      liveLine: MessageKey | null;
    };

const ORDER: TrackStage[] = ["sandbox", "pilot", "live"];
const NAME: Record<TrackStage, MessageKey> = { sandbox: "settingsGoLive.stageSandbox", pilot: "settingsGoLive.stagePilot", live: "settingsGoLive.stageLive" };
const MEANING: MeaningRow[] = [
  { label: "settingsGoLive.meaningPeople", values: { sandbox: "settingsGoLive.valueReal", pilot: "settingsGoLive.valueReal", live: "settingsGoLive.valueReal" } },
  { label: "settingsGoLive.meaningMessages", values: { sandbox: "settingsGoLive.valueNoneLeave", pilot: "settingsGoLive.valueCaseMails", live: "settingsGoLive.valueEverything" } },
  { label: "settingsGoLive.meaningReminders", values: { sandbox: "settingsGoLive.valueNone", pilot: "settingsGoLive.valueIfOn", live: "settingsGoLive.valueIfOn" } },
  { label: "settingsGoLive.meaningReport", values: { sandbox: "settingsGoLive.valueNotCounted", pilot: "settingsGoLive.valueCountedWeekly", live: "settingsGoLive.valueCountedWeekly" } },
];

/** ISO week number of a UTC date, and the Monday that starts the week after it. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - jan1) / 86_400_000 + 1) / 7);
}
export function nextMonday(d: Date): Date {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + (8 - (t.getUTCDay() || 7)));
  return t;
}

export type GoLiveViewInput = {
  stage: string;
  /** A company admin of this company (the page already guarantees it; the view does not assume it). */
  admin: boolean;
  checks: readonly GoLiveCheck[];
  /** CompanyConfig.notifications. */
  notifications: boolean;
  now: Date;
};

const count = (cs: readonly GoLiveCheck[], level: GoLiveCheck["level"]) => {
  const of = cs.filter((c) => c.level === level);
  return { done: of.filter((c) => c.state === "done").length, total: of.length };
};

export function goLiveView(i: GoLiveViewInput): GoLiveView {
  if (i.stage === "demo") return { kind: "demo" };
  const stage = ORDER.find((s) => s === i.stage);
  if (!stage) return { kind: "demo" }; // unknown stage: show nothing that can move it
  const at = ORDER.indexOf(stage);
  const track: TrackStep[] = ORDER.map((s, n) => ({ stage: s, label: NAME[s], state: n < at ? "past" : n === at ? "current" : n === at + 1 ? "next" : "later" }));
  const open = blockers(i.checks).length;

  let sw: SwitchView | null = null;
  if (i.admin && stage === "sandbox") {
    const start = nextMonday(i.now);
    sw = {
      to: "pilot", label: "settingsGoLive.switchToPilot", disabled: open > 0, open,
      dialog: {
        title: "settingsGoLive.toPilotTitle",
        lines: [
          { key: "settingsGoLive.toPilotMails" },
          { key: i.notifications ? "settingsGoLive.toPilotRemindersOn" : "settingsGoLive.toPilotRemindersOff" },
          { key: "settingsGoLive.toPilotReport", values: { week: isoWeek(start), date: start.toISOString() } },
          { key: "settingsGoLive.toPilotBack" },
        ],
        confirm: "settingsGoLive.switchToPilot", danger: false,
      },
    };
  } else if (i.admin && stage === "pilot") {
    sw = {
      to: "sandbox", label: "settingsGoLive.switchBack", disabled: false, open: 0,
      dialog: {
        title: "settingsGoLive.toSandboxTitle",
        lines: [
          { key: "settingsGoLive.toSandboxMessages" },
          { key: "settingsGoLive.toSandboxReport", values: { week: isoWeek(i.now) } },
          { key: "settingsGoLive.toSandboxSignOut" },
        ],
        confirm: "settingsGoLive.switchToSandbox", danger: true,
      },
    };
  }
  return {
    kind: "stage", stage, track, meaning: MEANING,
    checklistTitle: stage === "sandbox" ? "settingsGoLive.readyTitle" : "settingsGoLive.stillReadyTitle",
    needed: count(i.checks, "needed"), recommended: count(i.checks, "recommended"),
    switch: sw, liveLine: stage === "pilot" ? "settingsGoLive.liveLine" : null,
  };
}

const CHECK_NAME: Record<GoLiveCheck["key"], MessageKey> = {
  structure: "settingsGoLive.checkStructure", routes: "settingsGoLive.checkRoutes", calendar: "settingsGoLive.checkCalendar",
  signIn: "settingsGoLive.checkSignIn", secondFactor: "settingsGoLive.checkSecondFactor", mail: "settingsGoLive.checkMail",
  ai: "settingsGoLive.checkAi", backups: "settingsGoLive.checkBackups", support: "settingsGoLive.checkSupport",
  notifications: "settingsGoLive.checkNotifications", directory: "settingsGoLive.checkDirectory",
  recipients: "settingsGoLive.checkRecipients", baseline: "settingsGoLive.checkBaseline",
};
export const checkName = (c: GoLiveCheck): MessageKey => CHECK_NAME[c.key];
