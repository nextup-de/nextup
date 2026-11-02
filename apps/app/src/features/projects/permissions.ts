// Who may append which project.* event - the server's copy of the rules the project pages follow
// (docs/plans/2026-10-15_idea-to-project.md, "New events"). Called from features/cases/permissions.ts.
// Pure: the reduced state in, a verdict out.
import type { Actor, Verdict } from "@/features/cases/permissions";
import type { EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { translate, DEFAULT_LOCALE, type Locale, type MessageKey } from "@/i18n";
import { STEP_COLUMNS, SYNC_SYSTEMS } from "./types";

const OK: Verdict = { ok: true };

const text = (v: unknown, max = 2000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
// A link ends up as <a href> on the board: only http(s), never javascript: or data: (same rule as the
// connectors' allow-list, features/integrations).
const webUrl = (v: unknown): v is string => typeof v === "string" && v.length <= 1000 && /^https?:\/\/\S+$/i.test(v);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The columns a new step may start in: Blocked needs its reason, so a step only moves there. */
const STARTS: readonly string[] = ["todo", "doing", "done"];

/** Ids a client mints for a project or a step (features/cases/events newId). */
export const isProjectId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

export function mayAppendProject(actor: Actor, ev: { type: string; target: string | null; payload: EventPayload }, state: State, locale: Locale = DEFAULT_LOCALE): Verdict {
  const no = (key: MessageKey, params?: Record<string, string | number>): Verdict => ({ ok: false, error: translate(locale, key, params) });
  const p = ev.target ? state.projects.find((x) => x.id === ev.target) : undefined;
  if (!p) return no("projects.permNoProject");
  const pl = ev.payload;
  const isManager = actor.role === "manager";
  // Who someone is: the user id, never the label (IDN/D2).
  const uid = actor.userId ?? null;
  const isMe = (who: string | null) => uid !== null && who === uid;
  const isLead = isMe(p.leadUserId) || isManager;
  const onTeam = isLead || p.memberUserIds.some(isMe);
  const live = p.status !== "stopped" && p.status !== "recognised";
  
  switch (ev.type) {
    case "project.commented":
      return text(pl.text) ? OK : no("projects.permCommentText");

    case "project.member":
      if (!isLead) return no("projects.permLeadOnly");
      return typeof pl.userId === "string" && pl.userId !== "" ? OK : no("projects.permMemberWhom");

    case "project.handed":
      if (!isLead) return no("projects.permLeadOnly");
      if (!live) return no("projects.permClosed");
      return typeof pl.toUserId === "string" && pl.toUserId !== "" ? OK : no("projects.permHandWhom");

    case "project.baseline":
      if (!isLead) return no("projects.permLeadOnly");
      if (p.status !== "planning") return no("projects.permBaselineBeforeStart");
      if (pl.none) return text(pl.why) ? OK : no("projects.permBaselineWhy");
      if (!text(pl.metric, 200) || typeof pl.value !== "number" || !Number.isFinite(pl.value)) return no("projects.permBaselineWhat");
      return pl.better === "up" || pl.better === "down" ? OK : no("projects.permBaselineBetter");

    case "project.started":
      if (!isLead) return no("projects.permLeadOnly");
      if (p.status !== "planning") return no("projects.permAlreadyStarted");
      return p.baseline ? OK : no("projects.permStartNeedsBaseline");

    case "project.step.added":
      if (!onTeam) return no("projects.permStepTeamAdd");
      if (!live) return no("projects.permClosed");
      if (!isProjectId(pl.stepId) || p.steps.some((s) => s.id === pl.stepId)) return no("projects.permStepIdUnusable");
      if (pl.to !== undefined && !(typeof pl.to === "string" && STARTS.includes(pl.to))) return no("projects.permStepStart");
      if (pl.note !== undefined && (typeof pl.note !== "string" || pl.note.length > 2000)) return no("projects.permDetailsLong");
      return text(pl.text, 500) ? OK : no("projects.permStepText");

    case "project.step.moved": {
      const step = p.steps.find((s) => s.id === pl.stepId);
      if (!step) return no("projects.permNoStep");
      // An unowned step is the team's: anyone on it may pick it up and move it.
      if (!(isLead || isMe(step.ownerUserId ?? null) || ((step.ownerUserId ?? null) === null && onTeam))) return no("projects.permStepMoveOwner");
      if (pl.before != null && !p.steps.some((s) => s.id === pl.before)) return no("projects.permNoStepAbove");
      return typeof pl.to === "string" && (STEP_COLUMNS as readonly string[]).includes(pl.to) ? OK : no("projects.permMoveWhere");
    }

    case "project.step.edited": {
      const step = p.steps.find((s) => s.id === pl.stepId);
      if (!step) return no("projects.permNoStep");
      if (!onTeam) return no("projects.permStepTeamChange");
      if (!live) return no("projects.permClosed");
      if (pl.removed) return isLead || isMe(step.byUserId ?? null) ? OK : no("projects.permStepRemove");
      if (pl.text !== undefined && !text(pl.text, 500)) return no("projects.permStepText");
      if (pl.owner !== undefined && !(typeof pl.owner === "string" && pl.owner.length <= 120)) return no("projects.permStepOwnerWho");
      if (pl.ownerUserId !== undefined && pl.ownerUserId !== null && typeof pl.ownerUserId !== "string") return no("projects.permStepOwnerWho");
      if (pl.dueDay !== undefined && pl.dueDay !== null && !(typeof pl.dueDay === "number" && Number.isFinite(pl.dueDay))) return no("projects.permStepDue");
      if (pl.note !== undefined && (typeof pl.note !== "string" || pl.note.length > 2000)) return no("projects.permDetailsLong");
      return OK;
    }

    case "project.linked":
      if (!isLead) return no("projects.permLeadOnly");
      if (pl.url !== undefined && pl.url !== "" && !webUrl(pl.url)) return no("projects.permLinkHttp");
      return webUrl(pl.url) || text(pl.key, 100) ? OK : no("projects.permLinkNeeds");

    case "project.sync":
      if (!isLead) return no("projects.permLeadOnly");
      if (!live) return no("projects.permClosed");
      if (!(SYNC_SYSTEMS as readonly unknown[]).includes(pl.system)) return no("projects.permSyncWhat", { systems: SYNC_SYSTEMS.join(", ") });
      return typeof pl.on === "boolean" ? OK : no("projects.permSyncOnOff");

    case "project.done":
      if (!isLead) return no("projects.permLeadOnly");
      return p.status === "running" ? OK : no("projects.permOnlyRunningDone");

    case "project.measured": {
      if (!isLead) return no("projects.permLeadOnly");
      const check = p.checks.find((c) => c.check === pl.check);
      if (!check) return no("projects.permNoCheck");
      if (check.measured) return no("projects.permCheckRecorded");
      if (state.day < check.opensDay) return no("projects.permCheckOpens");
      return typeof pl.value === "number" && Number.isFinite(pl.value) ? OK : no("projects.permMeasureNumber");
    }

    case "project.rewarded":
      if (!isManager) return no("projects.permRewardManager");
      return p.rewardDue ? OK : no("projects.permNoRewardDue");

    case "project.claimed":
      if (!p.authorUserIds.some(isMe)) return no("projects.permClaimAuthor");
      return p.reward && !p.claimed ? OK : no("projects.permNoRewardToClaim");

    case "project.stopped":
      if (!isLead) return no("projects.permLeadOnly");
      if (!live) return no("projects.permAlreadyClosed");
      return text(pl.why) ? OK : no("projects.permStopWhy");

    default:
      return no("projects.permNotAllowed");
  }
}
