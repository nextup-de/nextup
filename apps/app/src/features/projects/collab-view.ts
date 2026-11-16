// Projects › Collaboration (Kevin, 16 Nov 2026): three lists, projects only.
//   1. the projects this person works on but does not lead;
//   2. the requests other people sent to a project of this person or of their unit (help, resources, a handoff),
//      open ones first, with who asks and by when;
//   3. the projects whose team spans more than one unit, with the units.
// Pure: the projects the viewer may see in, plain rows out. A unit is a department id.
import { fieldsOf, type ProjectStatus, type ReducedProject, type Request } from "./types";

/** A person as a project names them: the user id when the events carried one, and the label. */
export type TeamPerson = { userId: string | null; name: string };
/** The unit a person belongs to; null when nobody knows. */
export type UnitOf = (person: TeamPerson) => string | null;

const RANK: Record<ProjectStatus, number> = { running: 0, planning: 1, measuring: 2, measured: 3, recognised: 3, stopped: 4 };
const byStatus = (a: ReducedProject, b: ReducedProject) => RANK[a.status] - RANK[b.status] || a.number - b.number;
const live = (p: ReducedProject) => p.status !== "stopped" && !p.closed;

/** Lead first, then the members, matched by id where there is one. */
export function teamPeople(p: ReducedProject): TeamPerson[] {
  return [{ userId: p.leadUserId, name: p.lead }, ...p.members.map((name, i) => ({ userId: p.memberUserIds[i] ?? null, name }))];
}

const onTeam = (p: ReducedProject, userId: string) => p.leadUserId === userId || p.memberUserIds.includes(userId);

/** 1. Open projects this person is a member of and does not lead. */
export function worksOn(list: readonly ReducedProject[], userId: string | null): ReducedProject[] {
  if (userId === null) return [];
  return list.filter((p) => live(p) && p.leadUserId !== userId && p.memberUserIds.includes(userId)).sort(byStatus);
}

export type IncomingRequest = {
  request: Request;
  /** The project it was sent to. */
  project: { id: string; number: number; title: string };
  /** The form's title; null when the form is gone. */
  formTitle: string | null;
  /** The first short answer: what is asked, in the asker's words. */
  what: string | null;
  /** The projects the asker works on, other than this one: where the request comes from. */
  fromProjects: { id: string; number: number; title: string }[];
  /** The day the asker needs it by: the first date answer. Null when the form asks for none. */
  byDay: number | null;
};

/**
 * 2. Requests to a project this person is on, or to one a person of their unit leads, sent by someone outside its
 * team. Open (new) ones first, the soonest needed first; then the answered ones, newest first.
 */
export function incomingRequests(list: readonly ReducedProject[], viewer: { userId: string | null; unit: string | null }, unitOf: UnitOf): IncomingRequest[] {
  const { userId, unit } = viewer;
  const ref = (p: ReducedProject) => ({ id: p.id, number: p.number, title: p.title });
  const mine = list.filter((p) => p.status !== "stopped" && ((userId !== null && onTeam(p, userId)) || (unit !== null && unitOf({ userId: p.leadUserId, name: p.lead }) === unit)));
  const rows = mine.flatMap((p) => p.requests
    .filter((r) => r.byUserId === null || !onTeam(p, r.byUserId))
    .map((request): IncomingRequest => {
      const form = p.forms.find((f) => f.id === request.formId) ?? null;
      const fields = form ? fieldsOf(form, request.formRev) : [];
      const answer = (kind: string) => fields.filter((f) => f.kind === kind).map((f) => (request.answers[f.id] ?? "").trim()).find((v) => v !== "") ?? null;
      const date = answer("date");
      const asker = request.byUserId;
      return {
        request, project: ref(p), formTitle: form?.title ?? null, what: answer("short"),
        fromProjects: asker === null ? [] : list.filter((o) => o.id !== p.id && o.status !== "stopped" && onTeam(o, asker)).map(ref),
        byDay: date !== null && /^-?\d+$/.test(date) ? Number(date) : null,
      };
    }));
  const open = rows.filter((r) => r.request.state === "new")
    .sort((a, b) => (a.byDay ?? Infinity) - (b.byDay ?? Infinity) || a.request.day - b.request.day);
  const answered = rows.filter((r) => r.request.state !== "new").sort((a, b) => b.request.day - a.request.day);
  return [...open, ...answered];
}

export type CrossUnitProject = { project: ReducedProject; units: string[] };

/** 3. Open projects whose team spans two or more units; the lead's unit comes first. Most units first, then by status. */
export function crossUnitProjects(list: readonly ReducedProject[], unitOf: UnitOf): CrossUnitProject[] {
  return list
    .filter(live)
    .map((project) => ({ project, units: [...new Set(teamPeople(project).map(unitOf).filter((u): u is string => u !== null))] }))
    .filter((row) => row.units.length > 1)
    .sort((a, b) => b.units.length - a.units.length || byStatus(a.project, b.project));
}
