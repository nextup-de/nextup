"use client";
// The one input sheet. One modal serves every action that needs input: a reason (pick one), a
// line of text, or a set of people. `kind` decides which parts show and what confirming does.
// Port of sheetVals() in legacy/demo/js/dashboard.js. Views open it via ctx.openSheet(kind, id).
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { Me, SeatRow } from "@/features/auth/identity";
import { noCategoryLabel, noCategorySub, type NoCategory } from "@/features/cases/no";
import type { ReducedCase } from "@/features/cases/reducer";
import { askSheet, dayOfDate, noSheet, passSheet, type NoProblem } from "@/features/cases/sheets";
import type { Route } from "@/features/demo/types";
import { projectLabel } from "@/features/projects/selectors";
import type { T } from "@/i18n";
import { Btn } from "@/components/dashboard/shared/primitives";
import { useT } from "@/i18n/client";
import { PersonFace } from "@/components/ui/elements";
import styles from "./InputSheet.module.css";
import { Frame, LOOP_SHEETS, LoopSheet } from "./LoopSheets";

export type Option = { id: string; label: string; sub: string };

/**
 * The seats a case can be handed to (IDN/D5): the route's owner and deputy first, then the other routes' owners (the team
 * leaders), each once, never a seat of the person handing it over. The id is the seat id, the label is the seat's label.
 */
export function handCandidates(
  route: Route | null, routes: readonly Route[], seats: readonly SeatRow[], me: Me, t: T, deptName: (id: string) => string,
): Option[] {
  const out: Option[] = [];
  const add = (seatId: string | null | undefined, sub: string) => {
    if (!seatId || me.seatIds.includes(seatId) || out.some((x) => x.id === seatId)) return;
    const seat = seats.find((s) => s.id === seatId);
    if (seat) out.push({ id: seat.id, label: seat.label, sub });
  };
  if (route) {
    add(route.ownerSeatId, t("shell.handOwner", { role: route.owner.role, dept: deptName(route.owner.dept) }));
    add(route.deputySeatId, route.ownerSeatId && me.seatIds.includes(route.ownerSeatId) ? t("shell.handDeputyYours") : t("shell.handDeputy"));
  }
  routes.forEach((r) => add(r.ownerSeatId, r.owner.role + " · " + deptName(r.owner.dept)));
  return out;
}
/** The pass sheet's pseudo-option "Not mine"; a seat id is never this. */
const BACK = "back";

/** The first thing missing on the No sheet, as the primary button says it. */
function noPrompt(t: T, problems: readonly NoProblem[], min: number): string {
  const first = problems[0];
  if (first === "category") return t("shell.noPick");
  if (first === "reason" || first === "reasonLong") return t("shell.noWriteReason", { min });
  if (first === "revisit" || first === "revisitUnneeded") return t("shell.noPickDate");
  if (first === "ref") return t("shell.noPickRef");
  return t("shell.noChangeIfLong");
}

/**
 * The No sheet (D17): a category with its sub-line, the reason with a live counter against the company's fewest characters,
 * what would make it a yes, a date for Not now (needed) and No budget (optional), and the case or project that already covers
 * it. "The wrong desk" is no no: its answer closes the sheet and opens Pass.
 */
function NoSheet({ c }: { c: ReducedCase }) {
  const ctx = useDemo();
  const t = useT();
  const { S, act, closeSheet, openSheet, showToast, f } = ctx;
  const [category, setCategory] = useState<NoCategory | null>(null);
  const [reason, setReason] = useState("");
  const [changeIf, setChangeIf] = useState("");
  const [date, setDate] = useState("");
  const [ref, setRef] = useState("");
  const [today] = useState(() => new Date());
  // The cases and projects the desk can see: what already covers the idea, never the idea itself.
  const refs = [
    ...S.projects.map((p) => ({ id: p.id, label: t("shell.noRefProject", { label: projectLabel(p), title: p.title }) })),
    ...S.cases.filter((x) => x.id !== c.id).map((x) => ({ id: x.id, label: t("shell.noRefCase", { title: x.title }) })),
  ];
  // A date that is no day for the company (a holiday, a weekend, no date at all) stays NaN: the sheet is not ready.
  const day = date === "" ? null : dayOfDate(date, S.clock, today, S.day) ?? Number.NaN;
  const sheet = noSheet(c, S.rules, S.day, { category, reason, changeIf, revisitDay: day, duplicateOf: ref || null }, refs.map((r) => r.id));
  const min = S.rules.noReasonMin;
  const count = reason.trim().length;
  const confirm = () => {
    const payload = sheet.payload();
    if (!payload || !sheet.picked) return;
    act.no(c.id, payload);
    closeSheet();
    showToast(t("shell.noDone", { clock: c.clock, category: t(noCategoryLabel(sheet.picked.id)), from: c.from }));
  };
  const tomorrow = new Date(today.getTime() + 864e5).toISOString().slice(0, 10);
  const dayBad = date !== "" && (day === null || Number.isNaN(day) || sheet.problems.includes("revisit"));
  return (
    <Frame label={t("shell.noEyebrow")} title={c.title} sub={t("shell.noSub", { from: c.from })}
      actions={<><Btn kind={sheet.ok ? "primary" : "disabled"} onClick={confirm}>{sheet.ok ? t("shell.noSend") : noPrompt(t, sheet.problems, min)}</Btn><Btn fixed onClick={closeSheet}>{t("shell.cancel")}</Btn></>}>
      <div className={styles.leadIn} role="group" aria-label={t("shell.noLeadIn")}>
        <div className={styles.textLabel}>{t("shell.noLeadIn")}</div>
        <div className={styles.leadInRow}>
          <button type="button" className={styles.leadInBtn} data-on="true" aria-pressed="true">{t("shell.noLeadReal")}</button>
          <button type="button" className={styles.leadInBtn} onClick={() => openSheet("hand", c.id)}>{t("shell.noLeadWrong")}</button>
        </div>
      </div>
      <div className={styles.options}>
        {sheet.categories.filter((x) => !x.hidden).map((x) => (
          <button key={x.id} type="button" className={styles.option} data-on={category === x.id ? "true" : undefined} onClick={() => { setCategory(x.id); if (x.date === "none") setDate(""); }}>
            <div className={styles.optionLabel}>{t(noCategoryLabel(x.id))}</div>
            <div className={styles.optionSub}>{t(noCategorySub(x.id))}</div>
          </button>
        ))}
      </div>
      {sheet.categories.some((x) => x.hidden) && <div className={styles.hint}>{t("shell.noNotNowUsedUp")}</div>}

      <div className={styles.textLabel}>{t("shell.noReasonLabel", { from: c.from })}</div>
      <textarea className={styles.textarea} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t("shell.noReasonPlaceholder")} aria-label={t("shell.noReasonLabel", { from: c.from })} />
      <div className={styles.counter} data-ok={count >= min ? "true" : undefined} data-testid="no-reason-count">{t("shell.noReasonCount", { count, min })}</div>

      <div className={styles.textLabel}>{t("shell.noChangeIfLabel")}</div>
      <textarea className={styles.textarea} value={changeIf} onChange={(e) => setChangeIf(e.target.value)} rows={2} placeholder={t("shell.noChangeIfPlaceholder")} aria-label={t("shell.noChangeIfLabel")} />

      {sheet.picked && sheet.picked.date !== "none" && (
        <>
          <label className={styles.textLabel} htmlFor="no-revisit">{t(sheet.picked.date === "required" ? "shell.noRevisitRequired" : "shell.noRevisitOptional")}</label>
          <input id="no-revisit" className={styles.field} type="date" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} />
          <div className={styles.hint}>{dayBad ? t("shell.noRevisitBad") : t("shell.noRevisitHint", { date: day !== null ? f(day) : "…" })}</div>
        </>
      )}
      {sheet.picked?.needsRef && (
        <>
          <label className={styles.textLabel} htmlFor="no-ref">{t("shell.noRefLabel")}</label>
          <select id="no-ref" className={styles.field} value={ref} onChange={(e) => setRef(e.target.value)}>
            <option value="">{t("shell.noRefPick")}</option>
            {refs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </>
      )}
    </Frame>
  );
}

type Model = {
  eyebrow: string; title: string; sub: string;
  options?: Option[]; peopleNames?: string[]; extra?: React.ReactNode;
  textLabel?: string; placeholder?: string;
  ok: boolean; primaryLabel: string; primaryKind: "primary" | "accent";
  onConfirm: () => void;
};

export function InputSheet() {
  const ctx = useDemo();
  const t = useT();
  const { sheet, seed, S, act, patchSheet, closeSheet, showToast, deptName } = ctx;
  if (!sheet) return null;
  // The discussion stage and the yes that opens a project have sheets of their own.
  if ((LOOP_SHEETS as readonly string[]).includes(sheet.kind)) return <LoopSheet />;
  const c = S.cases.find((x) => x.id === sheet.id), i = S.ideas.find((x) => x.id === sheet.id);
  const text = (sheet.text || "").trim();
  const done = (msg: string) => { closeSheet(); showToast(msg); };

  let m: Model | null = null;
  if (sheet.kind === "no" && c) {
    return <NoSheet key={c.id} c={c} />;
  } else if (sheet.kind === "ask" && c) {
    const ok = text.length >= 4;
    // From the second question on: several questions are a discussion (D20).
    const discuss = askSheet(c, { discussion: ctx.flag("discussion") }).discussFirst;
    m = {
      eyebrow: t("shell.askEyebrow"), title: c.title, sub: t("shell.askSub", { from: c.from }),
      extra: discuss ? (
        <div className={styles.discussLine} data-testid="ask-discuss-first">
          <span>{t("shell.askDiscussLine")}</span>
          <button type="button" className={styles.discussBtn} onClick={() => ctx.openSheet("discuss", c.id)}>{t("shell.askDiscussButton")}</button>
        </div>
      ) : undefined,
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
    const cands = handCandidates(route, seed.routes, seed.seats, ctx.me, t, deptName);
    const input = { seatId: sheet.picked === BACK ? null : sheet.picked, back: sheet.picked === BACK, why: text };
    const pass = passSheet(c, ctx.me, ctx.role === "manager", S.day, { seats: seed.seats, routes: seed.routes, roles: seed.roles }, input);
    const notMine = pass.notMine ? { id: BACK, label: t("shell.handNotMine"), sub: t("shell.handNotMineSub", { from: pass.notMine.from }) } : null;
    const pickedLabel = sheet.picked === BACK ? pass.notMine?.from ?? "" : cands.find((x) => x.id === sheet.picked)?.label ?? "";
    const why = text.length >= 8;
    if (pass.mode === "up") {
      // After two passes by people: no seat list, it goes to the seat above the desk (the server sets the seat, D13).
      m = {
        eyebrow: t("shell.handUpEyebrow"), title: c.title, sub: t("shell.handUpSub", { from: c.from }),
        extra: <div className={styles.hint} data-testid="hand-up-line">{pass.up?.label ? t("shell.handUpTo", { name: pass.up.label }) : t("shell.handUpAbove")}</div>,
        textLabel: t("shell.handWhy"), placeholder: t("shell.handUpPlaceholder"),
        ok: pass.ok, primaryLabel: pass.ok ? t("shell.handSendUp") : t("shell.handSayWhy"), primaryKind: "accent",
        onConfirm: () => { const payload = pass.payload(); if (!payload) return; act.pass(c.id, payload); done(t("shell.handDoneUp", { from: c.from })); },
      };
    } else {
      // A pass needs a reason: the person receiving it and the one who raised it both read it.
      const picked = !!sheet.picked;
      m = {
        eyebrow: t("shell.handEyebrow"), title: c.title, sub: t("shell.handSub", { from: c.from }),
        options: [...(notMine ? [notMine] : []), ...cands], textLabel: t("shell.handWhy"), placeholder: t("shell.handPlaceholder"),
        ok: pass.ok, primaryLabel: !picked ? t("shell.handPick") : !why ? t("shell.handSayWhy") : t(pass.mode === "back" ? "shell.handSendBack" : "shell.handPassTo", { name: pickedLabel }), primaryKind: "accent",
        onConfirm: () => { const payload = pass.payload(); if (!payload) return; act.pass(c.id, payload); done(t(pass.mode === "back" ? "shell.handDoneBack" : "shell.handDone", { name: pickedLabel, from: c.from })); },
      };
    }
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

        {m.extra}

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
                  <PersonFace name={n} size="sm" />{n}
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
