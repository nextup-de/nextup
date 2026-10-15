// Who may append which event. The server's copy of the rules the UI already follows: a button
// that is hidden in the browser is only a courtesy, appendEventAction runs this before it writes.
//
// Pure: state in, verdict out. The caller reduces the company's log first, so "is this your case"
// is answered against the same state everybody sees.
import type { Role } from "@/config/roles";
import { isProjectId, mayAppendProject } from "@/features/projects/permissions";
import type { EventPayload } from "./events";
import type { State } from "./reducer";
import { onDesk } from "./selectors";

export type Actor = { role: Role; name: string; handle: string | null };
export type Verdict = { ok: true } | { ok: false; error: string };

const OK: Verdict = { ok: true };
const no = (error: string): Verdict => ({ ok: false, error });

/** Events on a case that only the person holding it (or a manager) may send. */
const DESK_EVENTS = new Set(["case.read", "case.decided", "case.handed", "case.asked"]);
/** Anyone in the company may add these to a case that exists. */
const OPEN_CASE_EVENTS = new Set(["case.affected", "case.unaffected", "case.commented"]);
const OPEN_IDEA_EVENTS = new Set(["idea.cosigned", "idea.uncosigned", "idea.asked"]);

export function mayAppend(
  actor: Actor,
  ev: { type: string; target: string | null; payload: Readonly<Record<string, unknown>> },
  state: State,
): Verdict {
  const isManager = actor.role === "manager";
  const kase = ev.target ? state.cases.find((c) => c.id === ev.target) : undefined;
  const idea = ev.target ? state.ideas.find((i) => i.id === ev.target) : undefined;
  const isMe = (who: string) => who === actor.name || (actor.handle !== null && who === actor.handle);

  switch (true) {
    case ev.type === "case.raised":
      // A second case.raised on an existing id would rebuild that case and drop its history.
      if (!ev.target) return no("A new case needs an id.");
      return kase || idea ? no("That case already exists.") : OK;

    case DESK_EVENTS.has(ev.type): {
      if (!kase) return no("No such case.");
      if (!(isManager || onDesk(kase, actor.name))) return no("Only the person this case sits with can do that.");
      return ev.type === "case.decided" ? mayDecide(ev.payload as EventPayload, kase, state) : OK;
    }

    // The discussion stage (docs/plans/2026-10-15_idea-to-project.md).
    case ev.type === "case.discussion":
      if (!kase) return no("No such case.");
      if (!(isManager || onDesk(kase, actor.name))) return no("Only the person this case sits with can start a discussion.");
      return kase.status === "open" ? OK : no("Only an open case can go into a discussion.");

    case ev.type === "case.invited":
    case ev.type === "case.checkin": {
      if (!kase) return no("No such case.");
      if (!(isManager || onDesk(kase, actor.name))) return no("Only the person this case sits with can do that.");
      if (kase.status !== "discussion" || !kase.discussion || kase.discussion.ready) return no("This case is not in a discussion.");
      if (ev.type === "case.invited") return Array.isArray(ev.payload.invited) && ev.payload.invited.length > 0 ? OK : no("Invite whom?");
      // The last allowed round ends in a decision; going on needs a manager.
      const lastRound = kase.discussion.rounds.length + 1 >= state.rules.discussMaxRounds;
      return ev.payload.next === "round" && lastRound && !isManager ? no("That was the last round - one more needs a manager.") : OK;
    }

    case ev.type === "case.revised":
      if (!kase) return no("No such case.");
      if (!isMe(kase.from)) return no("Only the person who raised this idea can revise it.");
      if (kase.decided) return no("This idea is decided - it can no longer change.");
      return typeof ev.payload.body === "string" && ev.payload.body.trim() ? OK : no("A new version needs its text.");

    case ev.type.startsWith("project."):
      return mayAppendProject(actor, { type: ev.type, target: ev.target, payload: ev.payload as EventPayload }, state);

    case ev.type === "case.answered":
      if (!kase) return no("No such case.");
      return isMe(kase.from) ? OK : no("Only the person who raised this case can answer its question.");

    case ev.type === "case.override":
      if (!kase) return no("No such case.");
      return isManager ? OK : no("Only a manager can re-route a case.");

    case OPEN_CASE_EVENTS.has(ev.type):
      return kase ? OK : no("No such case.");

    case OPEN_IDEA_EVENTS.has(ev.type):
      return idea ? OK : no("No such idea.");

    case ev.type === "idea.approved" || ev.type === "idea.funded":
      if (!idea) return no("No such idea.");
      return actor.role === "member" ? no("Only a team leader or a manager can approve an idea.") : OK;

    case ev.type === "day.advanced": {
      if (!isManager) return no("Only a manager can move the demo clock - everyone shares it.");
      const by = ev.payload.by ?? 1;
      return typeof by === "number" && Number.isInteger(by) && by >= 1 && by <= 30 ? OK : no("The clock moves 1 to 30 days at a time.");
    }

    default:
      return no("That event is not allowed here.");
  }
}

/** A yes that names a project opens it, or joins one that is still open - only as the case's first decision. */
function mayDecide(pl: EventPayload, kase: State["cases"][number], state: State): Verdict {
  if (pl.projectId === undefined) return OK;
  if (pl.answer !== "yes") return no("Only a yes opens a project.");
  if (kase.decided) return no("This case is already decided.");
  if (!isProjectId(pl.projectId)) return no("That project id is not usable.");
  if (typeof pl.lead !== "string" || !pl.lead.trim() || pl.lead.length > 120) return no("Who leads the project?");
  const project = state.projects.find((p) => p.id === pl.projectId);
  if (project && (project.status === "stopped" || project.status === "recognised")) return no("That project is closed.");
  return OK;
}
