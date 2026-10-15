// Who may append which project.* event - the server's copy of the rules the project pages follow
// (docs/plans/2026-10-15_idea-to-project.md, "New events"). Called from features/cases/permissions.ts.
// Pure: the reduced state in, a verdict out.
import type { Actor, Verdict } from "@/features/cases/permissions";
import type { EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { STEP_COLUMNS } from "./types";

const OK: Verdict = { ok: true };
const no = (error: string): Verdict => ({ ok: false, error });

const text = (v: unknown, max = 2000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
// A link ends up as <a href> on the board: only http(s), never javascript: or data: (same rule as the
// connectors' allow-list, features/integrations).
const webUrl = (v: unknown): v is string => typeof v === "string" && v.length <= 1000 && /^https?:\/\/\S+$/i.test(v);
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Ids a client mints for a project or a step (features/cases/events newId). */
export const isProjectId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

export function mayAppendProject(actor: Actor, ev: { type: string; target: string | null; payload: EventPayload }, state: State): Verdict {
  const p = ev.target ? state.projects.find((x) => x.id === ev.target) : undefined;
  if (!p) return no("No such project.");
  const pl = ev.payload;
  const isManager = actor.role === "manager";
  const isMe = (who: string | null) => who !== null && (who === actor.name || (actor.handle !== null && who === actor.handle));
  const isLead = isMe(p.lead) || isManager;
  const onTeam = isLead || p.members.some(isMe);
  const live = p.status !== "stopped" && p.status !== "recognised";
  const leadOnly = "Only the project's lead (or a manager) can do that.";

  switch (ev.type) {
    case "project.commented":
      return text(pl.text) ? OK : no("A comment needs some text.");

    case "project.member":
      if (!isLead) return no(leadOnly);
      return text(pl.name, 120) ? OK : no("Whom to add or remove?");

    case "project.handed":
      if (!isLead) return no(leadOnly);
      if (!live) return no("This project is closed.");
      return text(pl.to, 120) ? OK : no("Hand it to whom?");

    case "project.baseline":
      if (!isLead) return no(leadOnly);
      if (p.status !== "planning") return no("The baseline is taken before the start, never after.");
      if (pl.none) return text(pl.why) ? OK : no("Say why there is no number to measure.");
      if (!text(pl.metric, 200) || typeof pl.value !== "number" || !Number.isFinite(pl.value)) return no("A baseline needs what is measured and today's number.");
      return pl.better === "up" || pl.better === "down" ? OK : no("Say whether a higher or a lower number is better.");

    case "project.started":
      if (!isLead) return no(leadOnly);
      if (p.status !== "planning") return no("This project has already started.");
      return p.baseline ? OK : no("Take the baseline first - or say why there is no number.");

    case "project.step.added":
      if (!onTeam) return no("Only the project's team can add steps.");
      if (!live) return no("This project is closed.");
      if (!isProjectId(pl.stepId) || p.steps.some((s) => s.id === pl.stepId)) return no("That step id is not usable.");
      return text(pl.text, 500) ? OK : no("A step needs some text.");

    case "project.step.moved": {
      const step = p.steps.find((s) => s.id === pl.stepId);
      if (!step) return no("No such step.");
      if (!(isLead || isMe(step.owner))) return no("Only the step's owner or the project's lead can move it.");
      return typeof pl.to === "string" && (STEP_COLUMNS as readonly string[]).includes(pl.to) ? OK : no("Move it where?");
    }

    case "project.linked":
      if (!isLead) return no(leadOnly);
      if (pl.url !== undefined && pl.url !== "" && !webUrl(pl.url)) return no("A link must be an http or https address.");
      return webUrl(pl.url) || text(pl.key, 100) ? OK : no("A link needs an address or a key.");

    case "project.done":
      if (!isLead) return no(leadOnly);
      return p.status === "running" ? OK : no("Only a running project can be done.");

    case "project.measured": {
      if (!isLead) return no(leadOnly);
      const check = p.checks.find((c) => c.check === pl.check);
      if (!check) return no("There is no such check for this project.");
      if (check.measured) return no("That check is already recorded - a correction is a comment with its why.");
      if (state.day < check.opensDay) return no("That check opens on its day, not before.");
      return typeof pl.value === "number" && Number.isFinite(pl.value) ? OK : no("A measure needs the number.");
    }

    case "project.rewarded":
      if (!isManager) return no("Only a manager records a reward.");
      return p.rewardDue ? OK : no("No reward is due for this project.");

    case "project.claimed":
      if (!p.authors.some(isMe)) return no("Only the person who raised the idea can claim its reward.");
      return p.reward && !p.claimed ? OK : no("There is no reward to claim.");

    case "project.stopped":
      if (!isLead) return no(leadOnly);
      if (!live) return no("This project is already closed.");
      return text(pl.why) ? OK : no("Say why it stops.");

    default:
      return no("That event is not allowed here.");
  }
}
