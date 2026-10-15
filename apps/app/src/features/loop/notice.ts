// The mails after the routing (docs/plans/2026-10-15_idea-to-project.md): people asked for their view,
// everyone in a discussion at each check-in, and the author at every step of what their idea became.
// Pure like features/cases/notice.ts - the state after the event in, the messages out - so who gets
// what is unit-tested without a relay. server/loop-notice.ts sends them, never blocking the event.
import type { CaseEvent } from "@/features/cases/events";
import type { NoticeMail } from "@/features/cases/notice";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";

/** A person who can get mail: their name, and the handle they post under (anonymous members). */
export type Person = { name: string; email: string; handle?: string | null };

type Args = { ev: Pick<CaseEvent, "type" | "actor" | "target" | "payload">; state: State; people: Person[]; baseUrl: string };

const inDays = (n: number) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

export function loopMails({ ev, state, people, baseUrl }: Args): NoticeMail[] {
  const find = (who: string) => people.find((p) => p.name === who || (p.handle && p.handle === who));
  const out: NoticeMail[] = [];
  const seen = new Set<string>();
  const send = (who: string, subject: string, lines: string[]) => {
    const p = find(who);
    // Never write to whoever did it, never twice, never without an address.
    if (!p?.email || who === ev.actor || find(ev.actor)?.email === p.email || seen.has(p.email)) return;
    seen.add(p.email);
    out.push({ to: p.email, subject, text: [`${p.name},`, "", ...lines].join("\n") });
  };
  const caseLink = (c: ReducedCase) => `${baseUrl}/cases/${encodeURIComponent(c.id)}`;
  const projectLink = (p: ReducedProject) => `${baseUrl}/projects/${encodeURIComponent(p.id)}`;
  const kase = ev.target ? state.cases.find((c) => c.id === ev.target) : undefined;
  const project = ev.target ? state.projects.find((p) => p.id === ev.target) : undefined;
  const pl = ev.payload;

  switch (ev.type) {
    case "case.discussion":
    case "case.invited": {
      if (!kase?.discussion) break;
      const names = ev.type === "case.invited" ? pl.invited ?? [] : kase.discussion.invited;
      const due = kase.dueDay - state.day;
      for (const name of names) {
        send(name, `Your view is asked: ${kase.title}`, [
          `${ev.actor} asks for your view on this idea before it is decided:`, "", `  ${kase.title}`, "",
          ...(kase.discussion.missing ? [`Still missing: ${kase.discussion.missing}`, ""] : []),
          `The next check-in is ${inDays(due)}. Say what you know on the case: ${caseLink(kase)}`,
        ]);
      }
      if (ev.type === "case.discussion") {
        send(kase.from, `Your idea goes into a discussion: ${kase.title}`, [
          `${ev.actor} wants a few more views before deciding, with a check-in every ${state.rules.discussEveryDays} days.`,
          ...(kase.discussion.missing ? ["", `Still missing: ${kase.discussion.missing}`] : []),
          "", `You can add a new version on the case: ${caseLink(kase)}`,
        ]);
      }
      break;
    }
    case "case.checkin": {
      const d = kase?.discussion;
      const last = d?.rounds[d.rounds.length - 1];
      if (!kase || !d || !last) break;
      const lines = [
        last.next === "decide" ? `Round ${last.round} is done and the idea is ready to decide.` : `Round ${last.round} is done; the next check-in is ${inDays(kase.dueDay - state.day)}.`,
        ...(last.open.length ? ["", `Still open: ${last.open.join(", ")}`] : []),
        ...(last.note ? ["", last.note] : []),
        "", caseLink(kase),
      ];
      for (const who of [kase.from, ...d.invited]) send(who, `Check-in: ${kase.title}`, lines);
      break;
    }
    case "case.decided": {
      const p = kase?.decided?.projectId ? state.projects.find((x) => x.id === kase.decided?.projectId) : undefined;
      if (!kase || !p) break;
      send(kase.from, `Your idea was accepted: ${kase.title}`, [
        `${ev.actor} said yes. It is now ${projectLabel(p)} "${p.title}", led by ${p.lead}.`,
        "", "You will hear when it starts, when it is done, and what it changed.", "", projectLink(p),
      ]);
      send(p.lead, `You lead ${projectLabel(p)}: ${p.title}`, [
        `${ev.actor} accepted this idea and named you as its lead.`,
        "", `Take the number to measure it against, then start it - due ${inDays(p.dueDay !== null ? p.dueDay - state.day : 0)}.`,
        "", projectLink(p),
      ]);
      break;
    }
    case "project.handed":
      if (project) send(project.lead, `You lead ${projectLabel(project)}: ${project.title}`, [`${ev.actor} handed this project to you.`, ...(pl.why ? ["", pl.why] : []), "", projectLink(project)]);
      break;
    case "project.member":
      if (project && pl.on !== false && pl.name) send(pl.name, `You are on ${projectLabel(project)}: ${project.title}`, [`${ev.actor} added you to the team.`, "", projectLink(project)]);
      break;
    case "project.started":
    case "project.done":
    case "project.measured":
    case "project.rewarded": {
      if (!project) break;
      const what =
        ev.type === "project.started" ? "has started." :
        ev.type === "project.done" ? "is done. It will be measured against the number taken before it started." :
        ev.type === "project.measured" ? measured(project, pl.check) :
        `is recognised: ${project.reward?.rule === "thanks" || project.reward?.amount == null ? "thank you" : `${project.reward.amount} €`}${project.reward?.note ? ` - ${project.reward.note}` : ""}.`;
      for (const a of project.authors) send(a, `${projectLabel(project)} ${ev.type.split(".")[1]}: ${project.title}`, [`What your idea became ${what}`, "", projectLink(project)]);
      break;
    }
    default:
      break;
  }
  return out;
}

function measured(p: ReducedProject, check: number | undefined): string {
  const m = p.measures.find((x) => x.check === check);
  if (!m) return "was measured.";
  const b = p.baseline && !p.baseline.none ? p.baseline : null;
  const numbers = b ? ` ${b.metric}: ${b.value} → ${m.value}${b.unit ? " " + b.unit : ""}` : "";
  return `was measured after ${m.check} days: ${m.verdict}.${numbers}`;
}
