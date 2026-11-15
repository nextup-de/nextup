// Milestones <-> Jira versions (plan JSY): what a round should push and pull. Pure, like plan.ts and pull.ts: the reduced
// state, the versions and issues Jira returned, the events since the cursor and the settings in; jobs and events out.
//
// Ownership (D20): a version is written only for the one NextUp project and milestone named by its exact marker line AND by an
// `owned` link. An imported (unmarked) version is a read-only milestone: only its step links sync. A version marked for another
// project is never adopted, imported or changed; the round warns and keeps the issue's other fix versions as they are.
// Fields (D21): only what a person changed since the cursor goes to Jira; a later system event on the same field suppresses an
// earlier person edit; everything Jira changed on its own pulls. Equality is normalized (title 80, note 1000, marker stripped,
// day numbers in the company's clock mode), so a truncation or a weekend release date never echoes back.
// Retry (D22): creates and adoptions come from the state, edits, archives and fix versions from the events and keep their seq;
// whatever cannot be done yet is reported so the runner holds the cursor before it (`deferredSeq`).
import type { EventPayload } from "@/features/cases/events";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import type { CalendarSpec } from "@/features/clock";
import { jiraMilestoneId, syncIdemKey } from "@/features/integrations";
import type { Milestone, ReducedProject } from "@/features/projects/types";
import { isSystemActor } from "@/features/integrations";
import { isOpenProject, issueKeyOf, jiraIndex, syncMode } from "./map";
import type { SeqEvent } from "./plan";
import type { JiraDayClock, JiraIssue, JiraSettings, JiraVersion, JiraVersionPatch } from "./types";

type Projects = { projects: readonly ReducedProject[] };

/** At most this many version creates, updates and archives per round (D11); fix-version jobs and adoptions do not count. */
export const MAX_VERSION_WRITES = 20;
export const MAX_TITLE = 80;
export const MAX_NOTE = 1000;
const MAX_VERSION_NAME = 255;

// ---- The marker ---------------------------------------------------------------------------------------

const MARKER = /^\[nextup:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)\]$/;
const nl = (s: string) => s.replace(/\r\n?/g, "\n");

export const versionMarker = (projectId: string, milestoneId: string): string => `[nextup:${projectId}:${milestoneId}]`;

/** The marker on the last non-empty line of a description, or null. */
export function markerOf(description: string | undefined | null): { projectId: string; milestoneId: string } | null {
  const lines = nl(description ?? "").trimEnd().split("\n");
  const m = MARKER.exec((lines[lines.length - 1] ?? "").trim());
  return m ? { projectId: m[1], milestoneId: m[2] } : null;
}

/** The description without its marker line (and the blank line before it). */
export function stripMarker(description: string | undefined | null): string {
  const text = nl(description ?? "").trimEnd();
  const lines = text.split("\n");
  if (!MARKER.test((lines[lines.length - 1] ?? "").trim())) return text.trim();
  return lines.slice(0, -1).join("\n").trim();
}

/** The note, a blank line, the marker; just the marker for an empty note. Never a second marker. */
export function withMarker(note: string, projectId: string, milestoneId: string): string {
  const body = stripMarker(note);
  return body ? `${body}\n\n${versionMarker(projectId, milestoneId)}` : versionMarker(projectId, milestoneId);
}

// ---- Day space ----------------------------------------------------------------------------------------

type ClockIn = JiraDayClock | CalendarSpec;
const asClock = (c: ClockIn): JiraDayClock => ("mode" in c ? c : { mode: "workdays", calendar: c });
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const utcDay = (iso: string): number | null => {
  if (!ISO.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? t / 86_400_000 : null;
};

/** The ISO date of a day number in the company's clock mode, or null when the day has none. */
export function dateOfDay(day: number, clock: ClockIn): string | null {
  if (!Number.isInteger(day)) return null;
  const c = asClock(clock);
  try {
    if (c.mode === "workdays") return day >= 1 ? dateOfWorkday(day, c.calendar) : null;
    const base = utcDay(c.epoch);
    return base === null || day < 0 ? null : new Date((base + day) * 86_400_000).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * The day number of an ISO date. Workdays: the working day it falls on, or the one before a non-working date (as workdayOf does);
 * null before the calendar's first working day. Calendar: the days since the epoch; null before it.
 */
export function dayOfDate(iso: string, clock: ClockIn): number | null {
  const d = utcDay(iso);
  if (d === null) return null;
  const c = asClock(clock);
  if (c.mode === "workdays") {
    const n = workdayOf(new Date(`${iso}T12:00:00Z`), c.calendar);
    return n >= 1 ? n : null;
  }
  const base = utcDay(c.epoch);
  return base === null || d < base ? null : d - base;
}

export const sameDay = (iso: string, day: number, clock: ClockIn): boolean => dayOfDate(iso, clock) === day;

// ---- Normalized values and names ----------------------------------------------------------------------

const titleOf = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
const noteOf = (s: string) => nl(s).trim().slice(0, MAX_NOTE);
const hash36 = (v: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
};
/** The suffix that keeps a version name unique when its title is taken: stable per project and milestone. */
const suffixOf = (projectId: string, milestoneId: string) => ` (${hash36(`${projectId}:${milestoneId}`).slice(0, 6)})`;
const encoded = (title: string, projectId: string, milestoneId: string) => (titleOf(title).slice(0, MAX_VERSION_NAME - 10) + suffixOf(projectId, milestoneId)).slice(0, MAX_VERSION_NAME);
const lower = (s: string) => s.trim().toLowerCase();

/** The name to write: the title, or the title with the deterministic suffix when another version already has that name. */
function nameFor(title: string, projectId: string, milestoneId: string, versions: readonly JiraVersion[], selfId: string | null, reserved: ReadonlySet<string>): string {
  const plain = titleOf(title);
  const taken = reserved.has(lower(plain)) || versions.some((v) => v.id !== selfId && lower(v.name) === lower(plain));
  return taken ? encoded(title, projectId, milestoneId) : plain;
}

/** Does this version name stand for this title (plain, or with our own suffix)? Symmetric with nameFor. */
const nameMatches = (title: string, name: string, projectId: string | null, milestoneId: string | null): boolean =>
  titleOf(name) === titleOf(title) || (projectId !== null && milestoneId !== null && name.trim() === encoded(title, projectId, milestoneId));

/** The title a version name means: our own suffix is taken off when it is the one for this milestone. */
function titleFromName(name: string, m: Milestone, projectId: string): string {
  return nameMatches(m.title, name, projectId, m.id) ? m.title : titleOf(name);
}

/** Do a milestone and its version differ in any mapped field? Marker stripped, title and note normalized, dates in day space. */
export function versionDiffers(m: Milestone, v: JiraVersion, clock: ClockIn): boolean {
  const mk = markerOf(v.description);
  if (!nameMatches(m.title, v.name, mk?.projectId ?? null, mk?.milestoneId ?? null)) return true;
  if (noteOf(stripMarker(v.description)) !== noteOf(m.note)) return true;
  if (m.startDay === null ? !!v.startDate : !v.startDate || !sameDay(v.startDate, m.startDay, clock)) return true;
  if (!v.releaseDate || !sameDay(v.releaseDate, m.dueDay, clock)) return true;
  return v.released !== m.shipped;
}

// ---- Jobs and results ---------------------------------------------------------------------------------

export type VersionJob =
  | { kind: "create"; milestoneId: string; projectId: string; name: string; description: string; startDate: string | null; releaseDate: string; released: boolean }
  | { kind: "adopt"; milestoneId: string; projectId: string; version: JiraVersion }
  | { kind: "update"; seq: number; milestoneId: string; projectId: string; versionId: string; patch: JiraVersionPatch }
  | { kind: "archive"; seq: number; projectId: string; milestoneId: string; versionId: string }
  /** Set the issue's fix versions: take away every version of `mappedVersionIds`, add `versionId` (null: add none). Other versions stay. */
  | { kind: "fixVersion"; seq: number; projectId: string; stepId: string; issueKey: string; versionId: string | null; mappedVersionIds: string[] };

export type VersionPushPlan = {
  jobs: VersionJob[];
  warnings: string[];
  /** Milestones and steps with a person's edit not (yet) in Jira: the pull must not overwrite them this round. */
  pending: { milestones: string[]; steps: string[] };
  /** The smallest seq of an event whose job was not planned for a reason that may pass (cap, permission, link not there yet), or null. */
  deferredSeq: number | null;
};

type PushOpts = { enabledAt: Date | null; cal?: CalendarSpec; clock?: JiraDayClock; administer: boolean; maxWrites?: number };
const clockOf = (o: { cal?: CalendarSpec; clock?: JiraDayClock }): JiraDayClock => o.clock ?? { mode: "workdays", calendar: o.cal ?? { region: "DE", workdays: [1, 2, 3, 4, 5], extraHolidays: [], extraWorkdays: [] } };

const FIELDS = ["title", "note", "startDay", "dueDay", "shipped"] as const;
type Field = (typeof FIELDS)[number];
const ownedLink = (m: Milestone) => (m.external?.mode === "owned" ? m.external : null);

const pushable = (p: ReducedProject, settings: JiraSettings, enabledAt: number | null) => syncMode(p, settings, enabledAt) !== "off" && isOpenProject(p);

export function planVersionPush(state: Projects, versions: readonly JiraVersion[], events: readonly SeqEvent[], settings: JiraSettings, opts: PushOpts): VersionPushPlan {
  const clock = clockOf(opts);
  const enabledAt = opts.enabledAt ? opts.enabledAt.getTime() : null;
  const cap = opts.maxWrites ?? MAX_VERSION_WRITES;
  const warnings: string[] = [];
  const warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
  const byId = new Map(versions.map((v) => [v.id, v]));
  const claimed = new Set<string>();
  for (const p of state.projects) for (const m of p.milestones) if (m.external) claimed.add(m.external.key);
  const reserved = new Set<string>();
  const pendingMilestones = new Set<string>();
  const pendingSteps = new Set<string>();
  const creates: VersionJob[] = [];
  const adopts: VersionJob[] = [];
  const writes: (Extract<VersionJob, { kind: "update" | "archive" }>)[] = [];
  const fixes: VersionJob[] = [];
  const deferred: number[] = [];
  const noAdmin: number[] = [];
  let missingAdmin = false;

  const byProject = new Map<string, SeqEvent[]>();
  for (const e of events) if (e.target && e.type.startsWith("project.")) (byProject.get(e.target) ?? byProject.set(e.target, []).get(e.target)!).push(e);

  for (const p of state.projects) {
    if (!pushable(p, settings, enabledAt)) continue;
    const mine = byProject.get(p.id) ?? [];
    const mappedVersionIds = p.milestones.flatMap((m) => (m.external ? [m.external.key] : []));

    // ---- creates and adoptions: from the state, so a lost create response is found again by its marker
    for (const m of p.milestones) {
      if (m.external) continue;
      const marked = versions.filter((v) => { const k = markerOf(v.description); return k?.projectId === p.id && k.milestoneId === m.id; });
      const free = marked.filter((v) => !claimed.has(v.id));
      if (marked.length > 1) warn(`Milestone "${m.title}" of ${p.id}: more than one Jira version carries its marker; the first is used.`);
      if (free.length) { adopts.push({ kind: "adopt", milestoneId: m.id, projectId: p.id, version: free[0] }); claimed.add(free[0].id); continue; }
      if (marked.length) { warn(`Milestone "${m.title}" of ${p.id}: its marked Jira version is linked to another milestone; nothing is written.`); continue; }
      const releaseDate = dateOfDay(m.dueDay, clock);
      const startDate = m.startDay === null ? null : dateOfDay(m.startDay, clock);
      if (!releaseDate || (m.startDay !== null && !startDate) || (m.startDay !== null && m.startDay > m.dueDay)) {
        warn(`Milestone "${m.title}" of ${p.id} has no usable dates, so no Jira version is created for it.`);
        continue;
      }
      if (!opts.administer) { missingAdmin = true; continue; }
      const name = nameFor(m.title, p.id, m.id, versions, null, reserved);
      reserved.add(lower(name));
      creates.push({ kind: "create", milestoneId: m.id, projectId: p.id, name, description: withMarker(noteOf(m.note), p.id, m.id), startDate, releaseDate, released: m.shipped });
    }

    // ---- updates: only a person's still-pending fields on an owned, marked, linked version
    const lastField = new Map<string, Map<Field, SeqEvent>>();
    const linkSeq = new Map<string, number>();
    for (const e of mine) {
      if (e.type !== "project.milestone.added" && e.type !== "project.milestone.edited") continue;
      const id = e.payload.milestoneId;
      if (!id) continue;
      if (isSystemActor(e.actor) && e.payload.external) linkSeq.set(id, Math.max(linkSeq.get(id) ?? 0, e.seq));
      if (e.type !== "project.milestone.edited" || e.payload.removed) continue;
      const fields = lastField.get(id) ?? lastField.set(id, new Map()).get(id)!;
      for (const f of FIELDS) if (e.payload[f] !== undefined) fields.set(f, e);
    }
    for (const m of p.milestones) {
      const link = ownedLink(m);
      if (!link) continue;
      const pending = [...(lastField.get(m.id) ?? [])].filter(([, e]) => !isSystemActor(e.actor) && e.seq > (linkSeq.get(m.id) ?? 0));
      if (!pending.length) continue;
      const v = byId.get(link.key);
      if (!v) { warn(`The Jira version of milestone "${m.title}" (${p.id}) is gone from Jira; it is not recreated.`); continue; }
      const mk = markerOf(v.description);
      if (!mk || mk.projectId !== p.id || mk.milestoneId !== m.id) { warn(`Milestone "${m.title}" (${p.id}) no longer owns its Jira version; nothing is written.`); continue; }
      const fields = new Set(pending.map(([f]) => f));
      const patch: JiraVersionPatch = {};
      if (fields.has("title") && !nameMatches(m.title, v.name, p.id, m.id)) patch.name = nameFor(m.title, p.id, m.id, versions, v.id, reserved);
      if (fields.has("note") && noteOf(stripMarker(v.description)) !== noteOf(m.note)) patch.description = withMarker(noteOf(m.note), p.id, m.id);
      const dueDate = dateOfDay(m.dueDay, clock);
      const startDate = m.startDay === null ? null : dateOfDay(m.startDay, clock);
      const datesOk = !!dueDate && (m.startDay === null || (!!startDate && m.startDay <= m.dueDay));
      if ((fields.has("startDay") || fields.has("dueDay")) && !datesOk) warn(`Milestone "${m.title}" (${p.id}) has dates Jira cannot take; they are not sent.`);
      if (datesOk) {
        if (fields.has("startDay") && (m.startDay === null ? !!v.startDate : !v.startDate || !sameDay(v.startDate, m.startDay, clock))) patch.startDate = startDate;
        if (fields.has("dueDay") && (!v.releaseDate || !sameDay(v.releaseDate, m.dueDay, clock))) patch.releaseDate = dueDate;
      }
      if (fields.has("shipped") && v.released !== m.shipped) patch.released = m.shipped;
      if (!Object.keys(patch).length) continue;
      pendingMilestones.add(m.id);
      const seq = Math.min(...pending.map(([, e]) => e.seq));
      if (!opts.administer) { missingAdmin = true; noAdmin.push(seq); continue; }
      if (patch.name) reserved.add(lower(patch.name));
      writes.push({ kind: "update", seq, milestoneId: m.id, projectId: p.id, versionId: v.id, patch });
    }

    // ---- archives: a person removed an owned milestone; its version is archived, never deleted
    for (const e of mine) {
      if (e.type !== "project.milestone.edited" || !e.payload.removed || isSystemActor(e.actor) || !e.payload.milestoneId) continue;
      const t = (p.milestoneTombstones ?? []).find((x) => x.id === e.payload.milestoneId);
      if (!t?.external || t.external.mode !== "owned") continue;
      const v = byId.get(t.external.key);
      if (!v || v.archived) continue;
      const mk = markerOf(v.description);
      if (!mk || mk.projectId !== p.id || mk.milestoneId !== t.id) { warn(`The Jira version of removed milestone "${t.title}" (${p.id}) is not marked for it; it is left alone.`); continue; }
      if (!opts.administer) { missingAdmin = true; noAdmin.push(e.seq); continue; }
      writes.push({ kind: "archive", seq: e.seq, projectId: p.id, milestoneId: t.id, versionId: v.id });
    }

    // ---- fix versions: a person's last milestone choice on a step, once the issue and the version are both linked
    const lastStep = new Map<string, SeqEvent>();
    for (const e of mine) if (e.type === "project.step.edited" && e.payload.stepId && e.payload.milestoneId !== undefined) lastStep.set(e.payload.stepId, e);
    for (const [stepId, e] of lastStep) {
      if (isSystemActor(e.actor) || !p.steps.some((s) => s.id === stepId)) continue;
      const issueKey = issueKeyOf(p, stepId);
      const target = e.payload.milestoneId === null || e.payload.milestoneId === undefined ? null : p.milestones.find((m) => m.id === e.payload.milestoneId) ?? undefined;
      if (target === undefined) continue; // the milestone is gone: its removal cleared the step
      if (!issueKey || (target && !target.external)) { pendingSteps.add(stepId); deferred.push(e.seq); continue; }
      let versionId: string | null = null;
      if (target?.external) {
        const v = byId.get(target.external.key);
        if (!v || v.archived) { warn(`The Jira version of milestone "${target.title}" (${p.id}) is ${v ? "archived" : "gone"}; step ${stepId} is not tagged with it.`); continue; }
        versionId = v.id;
      }
      pendingSteps.add(stepId);
      fixes.push({ kind: "fixVersion", seq: e.seq, projectId: p.id, stepId, issueKey, versionId, mappedVersionIds });
    }
  }

  if (missingAdmin) warn("Jira does not let the integration account change versions: it needs the Administer Projects permission. Versions are read, not written.");
  // Creates first (from the state), then edits and archives in log order; the cap counts these only.
  const ordered = [...writes].sort((a, b) => a.seq - b.seq);
  const room = Math.max(0, cap - creates.length);
  const kept = creates.slice(0, cap);
  const keptWrites = ordered.slice(0, room);
  for (const w of ordered.slice(room)) deferred.push(w.seq);
  deferred.push(...noAdmin);
  // A step whose milestone edit was dropped by the cap stays pending as well.
  const all = deferred.length ? Math.min(...deferred) : null;
  for (const w of ordered.slice(room)) if (w.kind === "update") pendingMilestones.add(w.milestoneId);
  return {
    jobs: [...kept, ...adopts, ...keptWrites, ...fixes],
    warnings,
    pending: { milestones: [...pendingMilestones], steps: [...pendingSteps] },
    deferredSeq: all,
  };
}

// ---- Pull ---------------------------------------------------------------------------------------------

/** An event for the runner to append as the sync actor (after parseInbound with via "sync" and maySystemAppend). */
export type VersionPullEvent = {
  type: "project.milestone.added" | "project.milestone.edited" | "project.step.edited";
  target: string;
  payload: EventPayload;
  idemKey: string;
};

export type VersionPullPlan = { events: VersionPullEvent[]; warnings: string[] };

type PullOpts = { enabledAt: Date | null; cal?: CalendarSpec; clock?: JiraDayClock; pending?: { milestones?: readonly string[]; steps?: readonly string[] } };

const versionUrl = (s: Pick<JiraSettings, "siteUrl" | "projectKey">, id: string) => `${s.siteUrl.replace(/\/+$/, "")}/projects/${s.projectKey}/versions/${id}`;

export function planVersionPull(state: Projects, versions: readonly JiraVersion[], issues: readonly JiraIssue[], settings: JiraSettings, opts: PullOpts): VersionPullPlan {
  const clock = clockOf(opts);
  const enabledAt = opts.enabledAt ? opts.enabledAt.getTime() : null;
  const events: VersionPullEvent[] = [];
  const warnings: string[] = [];
  const warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
  const byId = new Map(versions.map((v) => [v.id, v]));
  const pendingM = new Set(opts.pending?.milestones ?? []);
  const pendingS = new Set(opts.pending?.steps ?? []);
  const index = jiraIndex(state);
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const importing = new Set<string>(); // `${projectId}:${versionId}` the round brings in as milestones

  // ---- existing links: fields that changed in Jira, only where nothing of ours is pending
  for (const p of state.projects) {
    if (syncMode(p, settings, enabledAt) === "off") continue;
    for (const m of p.milestones) {
      if (!m.external) continue;
      const v = byId.get(m.external.key);
      if (!v) { warn(`The Jira version of milestone "${m.title}" (${p.id}) is gone from Jira; the milestone stays as it is.`); continue; }
      const mk = markerOf(v.description);
      if (m.external.mode === "owned" ? !mk || mk.projectId !== p.id || mk.milestoneId !== m.id : !!mk && mk.projectId !== p.id) {
        warn(`The Jira version of milestone "${m.title}" (${p.id}) is marked for another milestone; it is not read.`);
        continue;
      }
      if (pendingM.has(m.id) || !versionDiffers(m, v, clock)) continue;
      const payload: EventPayload = { milestoneId: m.id };
      const title = titleFromName(v.name, m, p.id);
      if (title && title !== m.title) payload.title = title;
      const note = noteOf(stripMarker(v.description));
      if (note !== noteOf(m.note)) payload.note = note;
      let start: number | null = m.startDay;
      let due = m.dueDay;
      let ok = true;
      if (v.startDate) {
        const d = dayOfDate(v.startDate, clock);
        if (d === null) { warn(`Jira version "${v.name}" has a start date NextUp cannot place; it is skipped.`); ok = false; } else start = d;
      } else start = null;
      if (v.releaseDate) {
        const d = dayOfDate(v.releaseDate, clock);
        if (d === null) { warn(`Jira version "${v.name}" has a release date NextUp cannot place; it is skipped.`); ok = false; } else due = d;
      } else if (m.dueDay !== undefined) { warn(`Jira version "${v.name}" has no release date; the milestone keeps its due day.`); ok = false; }
      if (ok && start !== null && start > due) { warn(`Jira version "${v.name}" ends before it starts; its dates are skipped.`); ok = false; }
      if (ok) {
        if (start !== m.startDay) payload.startDay = start;
        if (due !== m.dueDay) payload.dueDay = due;
      }
      if (v.released !== m.shipped) payload.shipped = v.released;
      if (Object.keys(payload).length > 1) {
        events.push({ type: "project.milestone.edited", target: p.id, payload, idemKey: syncIdemKey("version", [p.id, v.id, "edit", String(p.history.length), hash36(JSON.stringify(payload))]) });
      }
    }
  }

  // ---- new versions: only those a fix version of a synced issue of that project names
  const seenMissingDate = new Set<string>();
  for (const issue of issues) {
    const ref = index.get(issue.key);
    const p = ref ? projects.get(ref.projectId) : undefined;
    if (!p || !ref?.stepId || syncMode(p, settings, enabledAt) === "off" || !isOpenProject(p)) continue;
    for (const fv of issue.fields.fixVersions ?? []) {
      if (importing.has(`${p.id}:${fv.id}`) || p.milestones.some((m) => m.external?.key === fv.id) || (p.milestoneTombstones ?? []).some((t) => t.external?.key === fv.id)) continue;
      const v = byId.get(fv.id);
      if (!v || v.archived) continue;
      const mk = markerOf(v.description);
      if (mk) {
        if (mk.projectId !== p.id) warn(`Jira version "${v.name}" belongs to another NextUp project; it is not shown here and its fix versions on ${issue.key} stay as they are.`);
        continue; // ours (the push adopts it) or someone else's: never imported
      }
      const title = titleOf(v.name);
      if (!title) continue;
      if (!v.releaseDate) { if (!seenMissingDate.has(v.id)) { seenMissingDate.add(v.id); warn(`Jira version "${v.name}" has no release date, so it is not a milestone.`); } continue; }
      const dueDay = dayOfDate(v.releaseDate, clock);
      const startDay = v.startDate ? dayOfDate(v.startDate, clock) : null;
      if (dueDay === null || (v.startDate && startDay === null) || (startDay !== null && startDay > dueDay)) { warn(`Jira version "${v.name}" has dates NextUp cannot use; it is not a milestone.`); continue; }
      const id = jiraMilestoneId(p.id, v.id);
      if (p.milestones.some((m) => m.id === id) || (p.milestoneTombstones ?? []).some((t) => t.id === id)) continue;
      importing.add(`${p.id}:${v.id}`);
      const note = noteOf(stripMarker(v.description));
      events.push({
        type: "project.milestone.added", target: p.id,
        payload: { milestoneId: id, title, dueDay, ...(startDay !== null ? { startDay } : {}), ...(note ? { note } : {}), external: { system: "jira", key: v.id, url: versionUrl(settings, v.id), mode: "imported" } },
        idemKey: syncIdemKey("version", [p.id, v.id]),
      });
      if (v.released) {
        events.push({ type: "project.milestone.edited", target: p.id, payload: { milestoneId: id, shipped: true }, idemKey: syncIdemKey("version", [p.id, v.id, "shipped"]) });
      }
    }
  }

  // ---- steps: the issue's first fix version that maps to a milestone of the same project
  for (const issue of issues) {
    const ref = index.get(issue.key);
    const p = ref ? projects.get(ref.projectId) : undefined;
    const step = p && ref?.stepId ? p.steps.find((s) => s.id === ref.stepId) : undefined;
    // fixVersions absent = the field was not asked for: that is not a clear.
    if (!p || !step || issue.fields.fixVersions === undefined || syncMode(p, settings, enabledAt) === "off" || pendingS.has(step.id)) continue;
    const fvs = issue.fields.fixVersions;
    // A version the round is only now importing is not yet a milestone: wait for the next round rather than clear.
    if (fvs.some((fv) => importing.has(`${p.id}:${fv.id}`))) continue;
    const hit = fvs.map((fv) => p.milestones.find((m) => m.external?.key === fv.id)).find((m) => m !== undefined);
    const want = hit?.id ?? null;
    if ((step.milestoneId ?? null) === want) continue;
    events.push({
      type: "project.step.edited", target: p.id, payload: { stepId: step.id, milestoneId: want },
      idemKey: syncIdemKey("version", [p.id, step.id, "step", String(p.history.length), want ?? "none"]),
    });
  }
  return { events, warnings };
}
