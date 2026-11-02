"use client";
// The one input sheet. One modal serves every action that needs input: a reason (pick one), a
// line of text, or a set of people. `kind` decides which parts show and what confirming does.
// Port of sheetVals() in legacy/demo/js/dashboard.js. Views open it via ctx.openSheet(kind, id).
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Btn } from "@/components/dashboard/shared/primitives";
import { useT } from "@/i18n/client";
import { ini } from "@/lib/utils/format";
import styles from "./InputSheet.module.css";
import { LOOP_SHEETS, LoopSheet } from "./LoopSheets";

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
  const t = useT();
  const { sheet, seed, S, persona, act, patchSheet, closeSheet, showToast, deptName } = ctx;
  if (!sheet) return null;
  // The discussion stage and the yes that opens a project have sheets of their own.
  if ((LOOP_SHEETS as readonly string[]).includes(sheet.kind)) return <LoopSheet />;
  const who = persona.who;
  const c = S.cases.find((x) => x.id === sheet.id), i = S.ideas.find((x) => x.id === sheet.id);
  const text = (sheet.text || "").trim();
  const done = (msg: string) => { closeSheet(); showToast(msg); };

  let m: Model | null = null;
  if (sheet.kind === "no" && c) {
    const ok = !!sheet.picked;
    m = {
      eyebrow: t("shell.noEyebrow"), title: c.title, sub: t("shell.noSub", { from: c.from }),
      options: [
        { id: "not now", label: t("shell.noNotNow"), sub: t("shell.noNotNowSub") },
        { id: "wrong department", label: t("shell.noWrongDept"), sub: t("shell.noWrongDeptSub") },
        { id: "not responsible", label: t("shell.noNobody"), sub: t("shell.noNobodySub") },
        { id: "no time", label: t("shell.noNoTime"), sub: t("shell.noNoTimeSub") },
        { id: "is it important", label: t("shell.noNoRank"), sub: t("shell.noNoRankSub") },
      ],
      textLabel: t("shell.noTextLabel", { from: c.from }), placeholder: t("shell.noPlaceholder"),
      ok, primaryLabel: ok ? t("shell.noSend") : t("shell.noPick"), primaryKind: "primary",
      onConfirm: () => { if (!ok || !sheet.picked) return; act.decide(c.id, "no", sheet.picked, text); done(t("shell.noDone", { clock: c.clock, reason: sheet.picked, from: c.from })); },
    };
  } else if (sheet.kind === "ask" && c) {
    const ok = text.length >= 4;
    m = {
      eyebrow: t("shell.askEyebrow"), title: c.title, sub: t("shell.askSub", { from: c.from }),
      textLabel: t("shell.yourQuestion"), placeholder: t("shell.askPlaceholder"),
      ok, primaryLabel: ok ? t("shell.askSend") : t("shell.typeQuestion"), primaryKind: "primary",
      onConfirm: () => { if (!ok) return; act.ask(c.id, text); done(t("shell.askDone", { from: c.from, clock: c.clock })); },
    };
  } else if (sheet.kind === "reply" && c && c.question) {
    const ok = text.length >= 2, qBy = c.question.by;
    m = {
      eyebrow: t("shell.replyEyebrow", { by: qBy }), title: t("shell.replyTitle", { text: c.question.text || t("shell.replyOneQuestion") }), sub: t("shell.replySub", { by: qBy }),
      textLabel: t("shell.yourAnswer"), placeholder: t("shell.replyPlaceholder"),
      ok, primaryLabel: ok ? t("shell.replySend") : t("shell.replyType"), primaryKind: "accent",
      onConfirm: () => { if (!ok) return; act.answer(c.id, text); done(t("shell.replyDone", { by: qBy })); },
    };
  } else if (sheet.kind === "hand" && c) {
    const route = c.route;
    const cands: Option[] = [];
    const add = (name: string | undefined, sub: string) => { if (name && name !== who.name && !cands.some((x) => x.id === name)) cands.push({ id: name, label: name, sub }); };
    if (route) {
      if (route.owner.name !== who.name) add(route.owner.name, t("shell.handOwner", { role: route.owner.role, dept: deptName(route.owner.dept) }));
      add(route.deputy, route.owner.name === who.name ? t("shell.handDeputyYours") : t("shell.handDeputy"));
    }
    seed.leaders.forEach((n) => { const r = seed.routes.find((x) => x.owner.name === n); add(n, r ? r.owner.role + " · " + deptName(r.owner.dept) : t("shell.handTeamLead")); });
    // A pass needs a reason: the person receiving it and the one who raised it both read it.
    const picked = !!sheet.picked, why = text.length >= 8, ok = picked && why;
    m = {
      eyebrow: t("shell.handEyebrow"), title: c.title, sub: t("shell.handSub", { from: c.from }),
      options: cands, textLabel: t("shell.handWhy"), placeholder: t("shell.handPlaceholder"),
      ok, primaryLabel: !picked ? t("shell.handPick") : !why ? t("shell.handSayWhy") : t("shell.handPassTo", { name: sheet.picked ?? "" }), primaryKind: "accent",
      onConfirm: () => { if (!ok || !sheet.picked) return; act.hand(c.id, sheet.picked, text); done(t("shell.handDone", { name: sheet.picked, from: c.from })); },
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
      eyebrow: funded ? t("shell.fundEyebrow") : t("shell.approveEyebrow"), title: i.title,
      sub: (funded ? t("shell.fundLead") : t("shell.approveLead")) + t("shell.assignSub"),
      peopleNames: names, textLabel: t("shell.assignTextLabel"),
      placeholder: funded ? t("shell.fundPlaceholder") : t("shell.approvePlaceholder"),
      ok, primaryLabel: ok ? t(funded ? "shell.fundWith" : "shell.approveWith", { count: n }) : t("shell.assignPickOne"), primaryKind: "accent",
      onConfirm: () => { if (!ok) return; (funded ? act.fund : act.approve)(i.id, sheet.people, text); done(t(funded ? "shell.fundDone" : "shell.approveDone", { names: sheet.people.join(", "), count: n })); },
    };
  } else if (sheet.kind === "askIdea" && i) {
    const to = i.team[0] === "—" ? t("shell.theProposer") : i.team[0];
    const ok = text.length >= 4;
    m = {
      eyebrow: t("shell.askIdeaEyebrow"), title: i.title, sub: t("shell.askIdeaSub", { to }),
      textLabel: t("shell.yourQuestion"), placeholder: t("shell.askIdeaPlaceholder"),
      ok, primaryLabel: ok ? t("shell.askIdeaSend", { to }) : t("shell.typeQuestion"), primaryKind: "primary",
      onConfirm: () => { if (!ok) return; act.askIdea(i.id, text); done(t("shell.askIdeaDone", { title: i.title, to })); },
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
          <Btn fixed onClick={closeSheet}>{t("shell.cancel")}</Btn>
        </div>
      </div>
    </>
  );
}
