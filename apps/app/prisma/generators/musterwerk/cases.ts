// Weeks of case history for Musterwerk, as event rows (never as state): raised cases that are read,
// asked and answered, handed over, discussed with check-ins, decided no, or decided yes and carried
// through a project to its measure. About 3 raised cases per 100 people per week.
//
// The weeks are compressed: a project goes from decision to its first measure within a week, so even
// two weeks of history hold every kind of event. Nothing is placed after `now`, and no workday of the
// company's calendar is skipped. The clock facts (deadline, hand-over) are not written here: the
// scheduler writes them when index.ts steps it day by day.
import type { CaseEventType, EventPayload } from "../../../src/features/cases/events";
import { isWorkday, berlinDate, workdayOf } from "../../../src/features/clock/calendar";
import type { CalendarSpec } from "../../../src/features/clock";
import { ideasFor } from "../../../src/features/demo/life/catalog";
import type { HolderRow, Knowledge } from "../../../src/features/knowledge";
import type { UserRow } from "./people";
import type { Rng } from "./rng";

export type HistoryCtx = {
  slug: string;
  knowledge: Knowledge;
  users: readonly UserRow[];
  /** The holders with `userId` set (PeopleResult.holders). */
  holders: readonly HolderRow[];
  calendar: CalendarSpec;
};

export type HistoryRow = {
  id: string; ts: Date; day: number; type: CaseEventType; actor: string; actorUserId: string;
  targetId: string; payload: EventPayload;
};

/** One working day of the window. */
export type WindowDay = { iso: string; day: number };

const DAY_MS = 86_400_000;
const addDays = (iso: string, k: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + k * DAY_MS).toISOString().slice(0, 10);

/** The working days of the last `weeks` weeks up to the Berlin date of `now`, each with its working-day number. */
export function windowDays(weeks: number, now: Date, cal: CalendarSpec): WindowDay[] {
  const end = berlinDate(now);
  const out: WindowDay[] = [];
  let day = -1;
  for (let k = -(weeks * 7 - 1); k <= 0; k++) {
    const iso = addDays(end, k);
    if (!isWorkday(iso, cal)) continue;
    day = day < 0 ? workdayOf(new Date(`${iso}T12:00:00Z`), cal) : day + 1;
    out.push({ iso, day });
  }
  return out;
}

type Fate = "unread" | "read" | "answered" | "handed" | "discuss" | "checkin" | "decidedNo" | "project" | "started" | "done" | "measured";

/** Working days after the raising a fate needs to play out in full. */
const NEEDS: Record<Fate, number> = { unread: 0, read: 1, answered: 2, handed: 2, discuss: 2, checkin: 4, decidedNo: 2, project: 2, started: 3, done: 5, measured: 6 };

const FATES: readonly (readonly [Fate, number])[] = [
  ["unread", 8], ["read", 12], ["answered", 16], ["handed", 12], ["discuss", 8], ["checkin", 8],
  ["decidedNo", 12], ["project", 8], ["started", 6], ["done", 4], ["measured", 6],
];

/** The first cases are dealt these, so even a short history shows every kind of event. */
const FORCED: readonly Fate[] = ["unread", "measured", "checkin", "handed", "answered", "project", "started", "decidedNo", "done", "read"];

const TITLES: Record<string, readonly [string, string][]> = {
  maintenance: [["Presse 4 verliert Öldruck", "Seit gestern fällt der Öldruck an Presse 4 nach dem Anfahren ab."], ["Förderband hakt", "Das Band an Linie B bleibt mehrmals pro Schicht stehen."]],
  quality: [["Ausschuss bei Gehäuse G12 steigt", "Die Ausschussquote liegt diese Woche bei 6 statt 2 Prozent."], ["Reklamation Kunde Alpha", "Zwei Lieferungen mit Kratzern auf der Oberfläche."]],
  safety: [["Stolperstelle am Lagertor", "Der Boden vor Tor 3 ist uneben und bei Nässe rutschig."], ["Schutzgitter fehlt", "An der Stanze fehlt seit dem Umbau das seitliche Schutzgitter."]],
  material: [["Dichtungen fast aufgebraucht", "Der Bestand reicht noch für zwei Schichten."], ["Palettenmangel im Wareneingang", "Leere Paletten fehlen, die Anlieferung staut sich."]],
  it: [["Scanner verbindet sich nicht", "Die Handscanner im Versand melden keine Verbindung zum WLAN."], ["Zugriff auf Schichtplan gesperrt", "Nach dem Update kommt eine Fehlermeldung beim Öffnen."]],
  hr: [["Urlaubsantrag seit Wochen offen", "Mein Antrag für März wurde noch nicht bearbeitet."], ["Schichtwechsel mit Kollegen", "Ich möchte mit einem Kollegen die Spätschicht tauschen."]],
  purchasing: [["Ersatzfilter bestellen", "Die Filter für die Absauganlage müssen vor Monatsende bestellt werden."], ["Anderer Lieferant für Schrauben?", "Der aktuelle Lieferant liefert ständig zu spät."]],
  process: [["Rüstzeit an Linie A verkürzen", "Ein zweiter Werkzeugwagen würde jeden Wechsel um zehn Minuten kürzen."], ["Übergabeprotokoll digital", "Die Schichtübergabe auf Papier geht oft verloren."]],
  budget: [["Freigabe für Schulung", "Drei Kollegen brauchen die Staplerschulung, Kosten 1.200 Euro."], ["Mehrkosten Wartungsvertrag", "Der Vertrag wird um 8 Prozent teurer."]],
  tooling: [["Werkzeug für Variante B anpassen", "Die neue Variante passt nicht in die bestehende Aufnahme."], ["Zeichnung stimmt nicht mit Teil überein", "Die Bohrung sitzt 2 mm daneben."]],
};

type Step = { off: number; by: UserRow; type: CaseEventType; target: string; payload: EventPayload };

/** Cases and their follow-ups for the last `weeks` weeks, oldest first, with `ts` and `day`. */
export function musterwerkHistory(rng: Rng, ctx: HistoryCtx, weeks: number, now: Date): HistoryRow[] {
  const days = windowDays(weeks, now, ctx.calendar);
  if (days.length === 0) return [];
  const last = days.length - 1;
  const userById = new Map(ctx.users.map((u) => [u.id, u]));
  const holderOfRole = new Map(ctx.holders.map((h) => [h.roleId, h]));
  const seatUser = (h: HolderRow): UserRow => userById.get(h.userId!)!;
  const members = ctx.users.filter((u) => u.role === "member");
  const raisers = members.length ? members : ctx.users;
  const routes = ctx.knowledge.rules;

  const total = Math.max(10, Math.round(ctx.users.length * 0.03 * weeks));
  const steps: { step: Step; raise: number; seq: number; caseNo: number; k: number }[] = [];
  let seq = 0;

  for (let i = 0; i < total; i++) {
    const r = rng.fork(`case${i}`);
    const fate = i < FORCED.length ? FORCED[i] : r.weighted(FATES);
    const raise = i < FORCED.length ? r.int(0, Math.max(0, last - NEEDS[fate])) : r.int(0, last);
    const rule = r.pick(routes);
    const ownerH = holderOfRole.get(rule.ownerRoleId)!;
    const depH = holderOfRole.get(rule.deputyRoleId!)!;
    const owner = seatUser(ownerH);
    const dep = seatUser(depH);
    const raiser = r.pick(raisers);
    // A case that becomes a project is an improvement idea from the catalogue the live company draws from (features/demo/life),
    // with that idea's measure and steps; the others are the everyday problems below.
    const becomesProject = fate === "project" || fate === "started" || fate === "done" || fate === "measured";
    const idea = becomesProject ? r.pick(ideasFor(rule.key)) : null;
    const [title, body] = idea ? [idea.title, idea.body] : r.pick(TITLES[rule.key] ?? [["Anliegen", "Bitte prüfen."] as [string, string]]);
    const id = `${ctx.slug}-c${i}`;
    const projectId = `${ctx.slug}-pr${i}`;
    const list: Step[] = [];
    const add = (off: number, by: UserRow, type: CaseEventType, payload: EventPayload = {}, target = id) => list.push({ off, by, type, target, payload });

    add(0, raiser, "case.raised", {
      title, body, routeId: rule.key, assignee: owner.name, assigneeRoleHolderId: ownerH.id, fromDept: raiser.dept,
      kind: idea ? "idea" : r.chance(0.8) ? "problem" : "idea", reason: "keywords", ...(idea ? { upside: idea.upside } : {}),
      proposal: { routeId: rule.key, confidence: r.int(60, 95), source: "keywords", version: "musterwerk" },
    });

    const pj = idea?.project;
    const baseline = pj ? Math.round((pj.base[0] + r.next() * (pj.base[1] - pj.base[0])) * 10) / 10 : 0;
    const project = (decideOff: number) => {
      add(decideOff, owner, "case.decided", { answer: "yes", note: "Gute Idee, das machen wir.", projectId, lead: owner.name, leadUserId: owner.id, title });
      add(decideOff, owner, "project.baseline", { metric: pj!.metric, unit: pj!.unit, value: baseline, better: pj!.better, source: "manual" }, projectId);
    };
    const started = () => {
      add(3, owner, "project.started", {}, projectId);
      pj!.steps.forEach((text, k) => add(3, owner, "project.step.added", { stepId: `${projectId}-s${k + 1}`, text, owner: owner.name, ownerUserId: owner.id }, projectId));
      add(3, owner, "project.step.moved", { stepId: `${projectId}-s1`, to: "doing" }, projectId);
    };
    const done = () => {
      for (let k = 1; k <= pj!.steps.length; k++) add(5, owner, "project.step.moved", { stepId: `${projectId}-s${k}`, to: "done" }, projectId);
      add(5, owner, "project.done", { note: "Alle Schritte umgesetzt." }, projectId);
    };

    switch (fate) {
      case "unread":
        break;
      case "read":
        add(r.int(0, 1), owner, "case.read");
        break;
      case "answered":
        add(0, owner, "case.read");
        add(1, owner, "case.asked", { text: "Welche Schicht und welche Linie ist betroffen?" });
        add(r.int(1, 2), raiser, "case.answered", { text: "Spätschicht, Linie B, seit Montag." });
        break;
      case "handed":
        add(0, owner, "case.read");
        add(1, owner, "case.handed", { to: dep.name, toRoleHolderId: depH.id, why: r.pick(["absence", "expertise"]) });
        break;
      case "discuss": {
        const guests = invite(r, members, 2);
        add(1, owner, "case.discussion", { invited: guests.map((u) => u.name), invitedUserIds: guests.map((u) => u.id), missing: "Wie oft tritt es auf und was kostet es?" });
        add(2, raiser, "case.revised", { body: `${body} Es tritt etwa zweimal pro Woche auf.`, overall: r.int(55, 90) });
        break;
      }
      case "checkin":
        add(1, owner, "case.discussion", { invited: [raiser.name], invitedUserIds: [raiser.id], missing: "Was würde es kosten?" });
        add(2, raiser, "case.revised", { body: `${body} Geschätzte Kosten: 800 Euro.`, overall: r.int(55, 90) });
        add(4, owner, "case.checkin", { next: "round", open: ["Kosten", "Zeitplan"], note: "Noch offen: Kosten und Zeitplan." });
        break;
      case "decidedNo":
        add(0, owner, "case.read");
        add(2, owner, "case.decided", { answer: "no", reason: "Aktuell nicht priorisiert", note: "Wir schauen im nächsten Quartal erneut." });
        break;
      case "project":
        project(2);
        break;
      case "started":
        project(1);
        started();
        break;
      case "done":
        project(1);
        started();
        done();
        break;
      case "measured":
        project(1);
        started();
        done();
        add(6, owner, "project.measured", { check: 30, value: Math.round(baseline * (pj!.better === "down" ? 1 - pj!.gain : 1 + pj!.gain) * 10) / 10, source: "manual", note: "Gemessen wie die Ausgangslage." }, projectId);
        break;
    }
    list.forEach((step, k) => steps.push({ step, raise, seq: seq++, caseNo: i, k }));
  }

  // Place each step on its day, a few minutes apart, never after `now`.
  const rows = steps.flatMap(({ step, raise, seq: order, caseNo, k }) => {
    const at = raise + step.off;
    if (at > last) return [];
    // 07:00 UTC plus a per-case offset, then 40 minutes per step of the case: its steps stay in order within a day.
    const minutes = 7 * 60 + ((caseNo * 37) % 60) + k * 40;
    const dayStart = Date.parse(`${days[at].iso}T00:00:00Z`);
    // Today only part of the day has passed: squeeze its steps in before `now`, in the same order.
    const squeeze = at === last ? Math.min(1, Math.max(0, now.getTime() - dayStart) / (15 * 3_600_000)) : 1;
    const ts = new Date(Math.min(now.getTime(), dayStart + Math.round(minutes * 60_000 * squeeze)));
    return [{ ts, order, day: days[at].day, step }];
  });
  rows.sort((a, b) => a.ts.getTime() - b.ts.getTime() || a.order - b.order);
  return rows.map(({ ts, day, step }, i) => ({
    id: `${ctx.slug}-e${i}`, ts, day, type: step.type, actor: step.by.name, actorUserId: step.by.id, targetId: step.target, payload: step.payload,
  }));
}

/** Up to `k` distinct people to invite, drawn from `pool`. */
function invite(rng: Rng, pool: readonly UserRow[], k: number): UserRow[] {
  return rng.fork("invite").shuffle(pool).slice(0, k);
}
