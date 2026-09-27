"use client";
// The one input sheet. One modal serves every action that needs input: a reason (pick one), a
// line of text, or a set of people. `kind` decides which parts show and what confirming does.
// Port of sheetVals() in legacy/demo/js/dashboard.js. Views open it via ctx.openSheet(kind, id).
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Btn } from "@/components/dashboard/shared/primitives";
import { ini } from "@/lib/utils/format";
import styles from "./InputSheet.module.css";

type Option = { id: string; label: string; sub: string };
type Model = {
  eyebrow: string; title: string; sub: string;
  options?: Option[]; peopleNames?: string[];
  textLabel?: string; placeholder?: string;
  ok: boolean; primaryLabel: string; primaryKind: "primary" | "accent";
  onConfirm: () => void;
};

export function InputSheet() {
  const ctx = useDemo();
  const { sheet, seed, S, persona, act, patchSheet, closeSheet, showToast, deptName } = ctx;
  if (!sheet) return null;
  const who = persona.who;
  const c = S.cases.find((x) => x.id === sheet.id), i = S.ideas.find((x) => x.id === sheet.id);
  const text = (sheet.text || "").trim();
  const done = (msg: string) => { closeSheet(); showToast(msg); };

  let m: Model | null = null;
  if (sheet.kind === "no" && c) {
    const ok = !!sheet.picked;
    m = {
      eyebrow: "No, and why", title: c.title, sub: c.from + " is told today. A no with a reason beats silence; pick the one that is true.",
      options: [
        { id: "not now", label: "Not now", sub: "a real no from you — say why below" },
        { id: "wrong department", label: "Wrong department", sub: "it belongs to someone else — consider handing it over instead" },
        { id: "not responsible", label: "Nobody owns this", sub: "the map has no entry — it goes back to the department head" },
        { id: "no time", label: "No time this quarter", sub: "you would take it, the plan is full" },
        { id: "is it important", label: "Does not rank", sub: "against what the team has on, it is not the next thing" },
      ],
      textLabel: "One line for " + c.from + " (optional)", placeholder: "e.g. Q4 at the earliest — the fixture team is on the 4-series until then",
      ok, primaryLabel: ok ? "Send the no" : "Pick a reason", primaryKind: "primary",
      onConfirm: () => { if (!ok || !sheet.picked) return; act.decide(c.id, "no", sheet.picked, text); done("Answered “no” in " + c.clock + " days — " + sheet.picked + ". " + c.from + " has been told."); },
    };
  } else if (sheet.kind === "ask" && c) {
    const ok = text.length >= 4;
    m = {
      eyebrow: "Ask one question", title: c.title, sub: "One question, not a form. The clock pauses until " + c.from + " answers; it lands in their My cases.",
      textLabel: "Your question", placeholder: "e.g. Which belt size — the 40 mm or the 60 mm?",
      ok, primaryLabel: ok ? "Send the question" : "Type the question", primaryKind: "primary",
      onConfirm: () => { if (!ok) return; act.ask(c.id, text); done("Question sent to " + c.from + ". The clock is paused at " + c.clock + " d."); },
    };
  } else if (sheet.kind === "reply" && c && c.question) {
    const ok = text.length >= 2, qBy = c.question.by;
    m = {
      eyebrow: "Answer " + qBy, title: "“" + (c.question.text || "One question.") + "”", sub: "Your answer goes straight back; the clock on " + qBy + " starts again the moment you send it.",
      textLabel: "Your answer", placeholder: "Short is fine.",
      ok, primaryLabel: ok ? "Send the answer" : "Type your answer", primaryKind: "accent",
      onConfirm: () => { if (!ok) return; act.answer(c.id, text); done("Answered. " + qBy + "’s clock is running again."); },
    };
  } else if (sheet.kind === "hand" && c) {
    const route = c.route;
    const cands: Option[] = [];
    const add = (name: string | undefined, sub: string) => { if (name && name !== who.name && !cands.some((x) => x.id === name)) cands.push({ id: name, label: name, sub }); };
    if (route) {
      if (route.owner.name !== who.name) add(route.owner.name, "the map’s owner · " + route.owner.role + ", " + deptName(route.owner.dept));
      add(route.deputy, route.owner.name === who.name ? "your deputy for this row" : "deputy on this row");
    }
    seed.leaders.forEach((n) => { const r = seed.routes.find((x) => x.owner.name === n); add(n, r ? r.owner.role + " · " + deptName(r.owner.dept) : "team lead"); });
    // A pass needs a reason: the person receiving it and the one who raised it both read it.
    const picked = !!sheet.picked, why = text.length >= 8, ok = picked && why;
    m = {
      eyebrow: "Pass on", title: c.title, sub: "Sideways, not up. Whoever you pick gets it in their inbox with the clock still running; " + c.from + " is told who has it now and why.",
      options: cands, textLabel: "Why them", placeholder: "e.g. Quality owns the gauge — we only see the symptom",
      ok, primaryLabel: !picked ? "Pick a person" : !why ? "Say why them" : "Pass to " + sheet.picked, primaryKind: "accent",
      onConfirm: () => { if (!ok || !sheet.picked) return; act.hand(c.id, sheet.picked, text); done("Passed to " + sheet.picked + ". Both of you and " + c.from + " have been told. The clock keeps running."); },
    };
  } else if (sheet.kind === "assign" && i) {
    const funded = i.status === "Unfunded";
    const names: string[] = [];
    const add = (n: string | undefined) => { if (n && n !== "—" && n !== "Anonymous" && !names.includes(n)) names.push(n); };
    i.team.forEach(add);
    const p = S.problems.find((x) => x.id === i.problem);
    seed.routes.filter((r) => p && p.depts.includes(r.owner.dept)).forEach((r) => { add(r.owner.name); add(r.deputy); });
    seed.buddies.forEach((b) => add(b.name));
    const ok = sheet.people.length > 0, n = sheet.people.length;
    m = {
      eyebrow: funded ? "Fund a trial" : "Approve and assign", title: i.title,
      sub: (funded ? "A trial needs people more than money. " : "Approving stops the clock; naming the team is what makes it real. ") + "Pick who runs it — they are told today, and the proposer is credited.",
      peopleNames: names, textLabel: "One line to the team (optional)",
      placeholder: funded ? "e.g. Four weeks, one site, measure the wait before and after" : "e.g. Start with the two pilot sites; report on Thursday",
      ok, primaryLabel: ok ? (funded ? "Fund it with " : "Approve with ") + n + (n === 1 ? " person" : " people") : "Pick at least one person", primaryKind: "accent",
      onConfirm: () => { if (!ok) return; (funded ? act.fund : act.approve)(i.id, sheet.people, text); done((funded ? "Trial funded. " : "Approved. ") + sheet.people.join(", ") + (n === 1 ? " has" : " have") + " been told; the clock is stopped."); },
    };
  } else if (sheet.kind === "askIdea" && i) {
    const to = i.team[0] === "—" ? "the proposer" : i.team[0];
    const ok = text.length >= 4;
    m = {
      eyebrow: "Ask a question", title: i.title, sub: "Goes to " + to + ". It shows under the idea for everyone, so the answer is asked once.",
      textLabel: "Your question", placeholder: "e.g. What happened at the two pilot sites when a purchase went wrong?",
      ok, primaryLabel: ok ? "Ask " + to : "Type the question", primaryKind: "primary",
      onConfirm: () => { if (!ok) return; act.askIdea(i.id, text); done("Question posted under “" + i.title + "”. " + to + " has been told."); },
    };
  }
  if (!m) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={closeSheet} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={m.eyebrow}>
        <div className={styles.eyebrow}>{m.eyebrow}</div>
        <div className={styles.title}>{m.title}</div>
        <div className={styles.sub}>{m.sub}</div>

        {m.options && (
          <div className={styles.options}>
            {m.options.map((o) => (
              <button key={o.id} type="button" className={styles.option} data-on={sheet.picked === o.id ? "true" : undefined} onClick={() => patchSheet({ picked: o.id })}>
                <div className={styles.optionLabel}>{o.label}</div>
                <div className={styles.optionSub}>{o.sub}</div>
              </button>
            ))}
          </div>
        )}

        {m.peopleNames && (
          <div className={styles.people}>
            {m.peopleNames.map((n) => {
              const on = sheet.people.includes(n);
              return (
                <button key={n} type="button" className={styles.person} data-on={on ? "true" : undefined}
                  onClick={() => patchSheet({ people: on ? sheet.people.filter((x) => x !== n) : sheet.people.concat([n]) })}>
                  <span className={styles.personIni}>{ini(n)}</span>{n}
                </button>
              );
            })}
          </div>
        )}

        {m.textLabel && (
          <>
            <div className={styles.textLabel}>{m.textLabel}</div>
            <textarea className={styles.textarea} value={sheet.text} onChange={(e) => patchSheet({ text: e.target.value })} rows={2} placeholder={m.placeholder} />
          </>
        )}

        <div className={styles.actions}>
          <Btn kind={m.ok ? m.primaryKind : "disabled"} onClick={m.onConfirm}>{m.primaryLabel}</Btn>
          <Btn fixed onClick={closeSheet}>Cancel</Btn>
        </div>
      </div>
    </>
  );
}
