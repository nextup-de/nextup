"use client";
// The sheets of the discussion stage and the yes that opens a project (docs/plans/2026-10-15_idea-to-project.md
// sections 1-2): "Discuss first", "Invite more", "Check in" and "Yes, do it". They open through
// ctx.openSheet like every other sheet (InputSheet hands these four kinds here) and keep their own
// draft state, because each has more fields than the shared sheet carries. Every confirm is one act.*.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { canOpen, standingOn, versionsOf } from "@/components/dashboard/derive";
import { Btn } from "@/components/dashboard/shared/primitives";
import { checkinDraft, inviteSuggestions, roundState, versionText, type InviteSuggestion } from "@/features/cases/discussion";
import type { ReducedCase } from "@/features/cases/reducer";
import { raisedWith } from "@/features/cases/rows";
import { commentsOn } from "@/features/cases/selectors";
import { closest, GOALS } from "@/features/evaluate";
import { SCORE_LABELS } from "@/features/ideas/brief";
import { benchmark } from "@/features/ideas/benchmarks";
import { ideaContext } from "@/features/ideas/drafts";
import { railOf } from "@/features/ideas/raise";
import { projectById, projectLabel } from "@/features/projects/selectors";
import { useFormat, useT } from "@/i18n/client";
import { ini } from "@/lib/utils/format";
import { brainCheckinAction } from "@/server/actions/brain";
import base from "./InputSheet.module.css";
import styles from "./LoopSheets.module.css";

export const LOOP_SHEETS = ["discuss", "invite", "checkin", "accept"] as const;

export function LoopSheet() {
  const { sheet, S } = useDemo();
  const c = sheet ? S.cases.find((x) => x.id === sheet.id) : undefined;
  if (!sheet || !c) return null;
  // Keyed by case: a sheet opened for another case starts from its own draft.
  if (sheet.kind === "discuss" && c.status === "open") return <DiscussSheet key={c.id} c={c} />;
  if (sheet.kind === "invite" && c.status === "discussion") return <InviteSheet key={c.id} c={c} />;
  if (sheet.kind === "checkin" && c.status === "discussion" && c.discussion && !c.discussion.ready) return <CheckinSheet key={c.id} c={c} />;
  if (sheet.kind === "accept") return <AcceptSheet key={c.id} c={c} />;
  return null;
}

function Frame({ label, title, sub, children, actions }: { label: string; title: string; sub: string; children?: React.ReactNode; actions: React.ReactNode }) {
  const { closeSheet } = useDemo();
  return (
    <>
      <div className={base.backdrop} onClick={closeSheet} />
      <div className={base.sheet} role="dialog" aria-modal="true" aria-label={label}>
        <div className={base.eyebrow}>{label}</div>
        <div className={base.title}>{title}</div>
        <div className={base.sub}>{sub}</div>
        {children}
        <div className={base.actions}>{actions}</div>
      </div>
    </>
  );
}

// ── people ──

// Suggested people as toggles (with why each is suggested), then anyone else from the directory.
function PeoplePicker({ suggested, picked, onToggle, skip }: { suggested: InviteSuggestion[]; picked: string[]; onToggle: (name: string) => void; skip: readonly string[] }) {
  const { seed } = useDemo();
  const t = useT();
  const [q, setQ] = useState("");
  const shown = new Set([...suggested.map((s) => s.name), ...skip]);
  const extra = picked.filter((n) => !shown.has(n));
  const term = q.trim().toLowerCase();
  const found = term ? seed.people.filter((p) => !shown.has(p.name) && !picked.includes(p.name) && (p.name.toLowerCase().includes(term) || p.role.toLowerCase().includes(term))).slice(0, 6) : [];
  const roleOf = (n: string) => seed.people.find((p) => p.name === n)?.role ?? "";
  const person = (name: string, note: string) => {
    const on = picked.includes(name);
    return (
      <button key={name} type="button" className={styles.person} data-on={on ? "true" : undefined} aria-pressed={on} onClick={() => onToggle(name)}>
        <span className={styles.ini} aria-hidden="true">{ini(name)}</span>
        <span className={styles.who}><span className={styles.name}>{name}</span><span className={styles.note}>{note}</span></span>
      </button>
    );
  };
  return (
    <>
      {suggested.length > 0 && <div className={base.textLabel}>{t("shell.loopSuggested")}</div>}
      <div className={styles.people}>
        {suggested.map((s) => person(s.name, s.note))}
        {extra.map((n) => person(n, roleOf(n) || t("shell.loopAddedByYou")))}
      </div>
      <div className={base.textLabel}>{t("shell.loopAddAnyone")}</div>
      <input className={`nh-input ${styles.search}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shell.loopSearchPlaceholder")} aria-label={t("shell.loopSearchPeople")} />
      {found.length > 0 && (
        <div className={styles.found}>
          {found.map((p) => (
            <button key={p.name} type="button" className={styles.foundRow} onClick={() => { onToggle(p.name); setQ(""); }}>
              <span className={styles.ini} aria-hidden="true">{ini(p.name)}</span>
              <span className={styles.who}><span className={styles.name}>{p.name}</span><span className={styles.note}>{p.role}</span></span>
            </button>
          ))}
        </div>
      )}
      {term && found.length === 0 && <div className={styles.none}>{t("shell.loopNoMatch")}</div>}
    </>
  );
}

const toggle = (list: string[], n: string) => (list.includes(n) ? list.filter((x) => x !== n) : list.concat([n]));

// Whom the sheet suggests for a case: the route, the people behind it, the department head, close ideas.
function useSuggestions(c: ReducedCase): InviteSuggestion[] {
  const ctx = useDemo();
  const { S, seed, persona } = ctx;
  const others = S.cases.filter((k) => k.id !== c.id && k.from !== c.from && canOpen(ctx, k));
  const close: { from: string; title: string }[] = [];
  let pool = others;
  for (let i = 0; i < 2; i++) { // the two closest by shared words
    const k = closest(c.title + " " + c.body, pool, (x) => x.title + " " + x.body);
    if (!k) break;
    close.push({ from: k.from, title: k.title });
    pool = pool.filter((x) => x.id !== k.id);
  }
  return inviteSuggestions(c, { people: seed.people, affected: standingOn(ctx, c), close, me: persona.who.name });
}

// ── Discuss first ──

function DiscussSheet({ c }: { c: ReducedCase }) {
  const ctx = useDemo();
  const { S, act, closeSheet, showToast, f } = ctx;
  const t = useT();
  const suggested = useSuggestions(c);
  // What the benchmark still misses, as the desk holder's first draft of "what is missing".
  const [missing, setMissing] = useState(() => {
    const bench = ideaContext(ctx.seed.routes, GOALS, S.cases.filter((k) => k.id !== c.id));
    const parts = benchmark({ text: versionText(c), affected: standingOn(ctx, c), attachments: raisedWith(c).attachments }, bench).parts;
    const open = railOf(parts).filter((g) => g.status !== "clear").map((g, i) => (i ? g.need.toLowerCase() : g.need));
    return open.length ? open.join(", ") + "." : "";
  });
  const [picked, setPicked] = useState<string[]>([]);
  const R = S.rules, ok = missing.trim().length >= 4 && picked.length > 0;
  const confirm = () => {
    if (!ok) return;
    act.discuss(c.id, picked, missing.trim());
    closeSheet();
    showToast(t("shell.discussDone", { count: picked.length, date: f(S.day + R.discussEveryDays) }));
  };
  return (
    <Frame label={t("shell.discussLabel")} title={c.title}
      sub={t("shell.discussSub", { days: R.discussEveryDays, rounds: R.discussMaxRounds, from: c.from })}
      actions={<><Btn kind={ok ? "primary" : "disabled"} onClick={confirm}>{!missing.trim() ? t("shell.discussSayMissing") : !picked.length ? t("shell.discussInviteSomeone") : t("shell.discussStart", { count: picked.length })}</Btn><Btn fixed onClick={closeSheet}>{t("shell.cancel")}</Btn></>}>
      <div className={base.textLabel}>{t("shell.discussMissing")}</div>
      <textarea className={base.textarea} value={missing} onChange={(e) => setMissing(e.target.value)} rows={2} placeholder={t("shell.discussMissingPlaceholder")} aria-label={t("shell.discussMissing")} />
      <PeoplePicker suggested={suggested} picked={picked} onToggle={(n) => setPicked((p) => toggle(p, n))} skip={[c.from, ctx.persona.who.name]} />
    </Frame>
  );
}

// ── Invite more ──

function InviteSheet({ c }: { c: ReducedCase }) {
  const ctx = useDemo();
  const { act, closeSheet, showToast } = ctx;
  const t = useT();
  const already = c.discussion?.invited ?? [];
  const suggested = useSuggestions(c).filter((s) => !already.includes(s.name));
  const [picked, setPicked] = useState<string[]>([]);
  const ok = picked.length > 0;
  const confirm = () => {
    if (!ok) return;
    act.invite(c.id, picked);
    closeSheet();
    showToast(t("shell.inviteDone", { names: picked.join(", "), count: picked.length }));
  };
  return (
    <Frame label={t("shell.inviteLabel")} title={c.title} sub={already.length ? t("shell.inviteIn", { names: already.join(", "), from: c.from }) : t("shell.inviteNobody")}
      actions={<><Btn kind={ok ? "primary" : "disabled"} onClick={confirm}>{ok ? t("shell.inviteButton", { count: picked.length }) : t("shell.invitePick")}</Btn><Btn fixed onClick={closeSheet}>{t("shell.cancel")}</Btn></>}>
      <PeoplePicker suggested={suggested} picked={picked} onToggle={(n) => setPicked((p) => toggle(p, n))} skip={[c.from, ctx.persona.who.name, ...already]} />
    </Frame>
  );
}

// ── Check in ──

function CheckinSheet({ c }: { c: ReducedCase }) {
  const ctx = useDemo();
  const { S, log, act, role, tenant, closeSheet, showToast, f } = ctx;
  const t = useT();
  const rs = roundState(c, S.rules, S.day);
  // The offline draft: new versions and comments since the last check-in, and the dials still weak.
  const [draft] = useState(() => {
    const versions = versionsOf(ctx, c);
    return checkinDraft(c, versions, commentsOn(log, c.id), versions[versions.length - 1].dials);
  });
  const blocked = !!rs?.last && role !== "manager"; // one more round past the last needs a manager
  const [next, setNext] = useState<"round" | "decide">(blocked || !draft.open.length ? "decide" : "round");
  const [open, setOpen] = useState<string[]>(draft.open);
  const [note, setNote] = useState(draft.note);
  const [by, setBy] = useState<"offline" | "brain">("offline");
  const touched = useRef(false); // once the desk holder edits, a late brain draft never overwrites it
  const mark = () => { touched.current = true; };
  // The brain drafts it when the stack has one (null otherwise); the offline draft stands until then.
  useEffect(() => {
    let live = true;
    brainCheckinAction({ slug: tenant.slug, caseId: c.id, weak: draft.open }).then((p) => {
      if (!live || !p || touched.current) return;
      setOpen(p.open);
      setNote(p.note);
      setNext(p.next === "round" && blocked ? "decide" : p.next);
      setBy("brain");
    }).catch(() => {});
    return () => { live = false; };
  }, [tenant.slug, c.id, draft.open, blocked]);
  const ok = !!note.trim() && !(next === "round" && blocked);
  const confirm = () => {
    if (!ok) return;
    act.checkin(c.id, next, open, note.trim());
    closeSheet();
    showToast(next === "decide" ? t("shell.checkinSentDecide") : t("shell.checkinSentRound", { round: (rs?.round ?? 1) + 1, date: f(S.day + S.rules.discussEveryDays) }));
  };
  const points = [...SCORE_LABELS, ...open.filter((o) => !(SCORE_LABELS as readonly string[]).includes(o))];
  return (
    <Frame label={t("shell.checkinLabel")} title={c.title}
      sub={t("shell.checkinSub", { round: rs?.round ?? 1, rounds: S.rules.discussMaxRounds })}
      actions={<><Btn kind={ok ? "primary" : "disabled"} onClick={confirm}>{next === "decide" ? t("shell.checkinSendDecide") : t("shell.checkinSendRound")}</Btn><Btn fixed onClick={closeSheet}>{t("shell.cancel")}</Btn></>}>
      <div className={base.options}>
        <button type="button" className={base.option} data-on={next === "decide" ? "true" : undefined} onClick={() => { mark(); setNext("decide"); }}>
          <div className={base.optionLabel}>{t("shell.checkinReady")}</div>
          <div className={base.optionSub}>{t("shell.checkinReadySub")}</div>
        </button>
        <button type="button" className={base.option} data-on={next === "round" ? "true" : undefined} onClick={() => { if (!blocked) { mark(); setNext("round"); } }} disabled={blocked} aria-disabled={blocked}>
          <div className={base.optionLabel}>{t("shell.checkinAnother")}</div>
          <div className={base.optionSub}>{blocked ? t("shell.checkinLastRound") : t("shell.checkinNextDue", { days: S.rules.discussEveryDays })}</div>
        </button>
      </div>
      <div className={base.textLabel}>{t("shell.checkinStillOpen")}</div>
      <div className={styles.points}>
        {points.map((p) => {
          const on = open.includes(p);
          return <button key={p} type="button" className={styles.point} data-on={on ? "true" : undefined} aria-pressed={on} onClick={() => { mark(); setOpen((o) => toggle(o, p)); }}>{p}</button>;
        })}
      </div>
      <div className={base.textLabel}>{t("shell.checkinNote")}</div>
      <textarea className={`${base.textarea} ${styles.draft}`} value={note} onChange={(e) => { mark(); setNote(e.target.value); }} rows={6} aria-label={t("shell.checkinNote")} />
      <div className={styles.none}>{by === "brain" ? t("shell.checkinDraftBrain") : t("shell.checkinDraftOffline")}</div>
    </Frame>
  );
}

// ── Yes, do it ──

function AcceptSheet({ c }: { c: ReducedCase }) {
  const { S, seed, persona, act, href, closeSheet, showToast } = useDemo();
  const t = useT();
  const fmt = useFormat();
  const me = persona.who.name;
  const [lead, setLead] = useState(me);
  const [title, setTitle] = useState(c.title);
  const [step, setStep] = useState("");
  const [opened, setOpened] = useState<string | null>(null); // the project id, once the yes is sent
  const ok = !!lead && title.trim().length >= 3;
  // The decider first, then the route's owner and deputy, then the rest of the directory.
  const leads = [...new Set([me, ...(c.route ? [c.route.owner.name, c.route.deputy] : []), ...seed.people.map((p) => p.name)])];
  const roleOf = (n: string) => (n === me ? t("shell.acceptYou") : seed.people.find((p) => p.name === n)?.role ?? "");
  const confirm = () => {
    if (!ok || opened) return;
    const id = act.accept(c.id, { lead, title: title.trim() });
    if (step.trim()) act.project.addStep(id, step.trim());
    setOpened(id);
    showToast(t("shell.acceptDone", { days: fmt.days(c.clock), from: c.from }));
  };
  if (opened) {
    const p = projectById(S, opened);
    const name = p ? projectLabel(p) : t("shell.acceptTheProject");
    return (
      <Frame label={t("shell.acceptLabel")} title={t("shell.acceptIsOpen", { name })} sub={t("shell.acceptOpenSub", { title: p?.title ?? title, lead })}
        actions={<><Link href={href("/projects/" + opened)} className={styles.go} onClick={closeSheet}>{t("shell.acceptOpen", { name })}</Link><Btn fixed onClick={closeSheet}>{t("shell.done")}</Btn></>} />
    );
  }
  return (
    <Frame label={t("shell.acceptLabel")} title={c.title} sub={t("shell.acceptSub", { from: c.from })}
      actions={<><Btn kind={ok ? "accent" : "disabled"} onClick={confirm}>{ok ? t("shell.acceptSend") : t("shell.acceptName")}</Btn><Btn fixed onClick={closeSheet}>{t("shell.cancel")}</Btn></>}>
      <label className={base.textLabel} htmlFor="accept-lead">{t("shell.acceptLead")}</label>
      <select id="accept-lead" className={`nh-input nh-select ${styles.field}`} value={lead} onChange={(e) => setLead(e.target.value)}>
        {leads.map((n) => <option key={n} value={n}>{n}{roleOf(n) ? " · " + roleOf(n) : ""}</option>)}
      </select>
      <label className={base.textLabel} htmlFor="accept-title">{t("shell.acceptTitle")}</label>
      <input id="accept-title" className={`nh-input ${styles.field}`} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className={base.textLabel} htmlFor="accept-step">{t("shell.acceptStep")}</label>
      <input id="accept-step" className={`nh-input ${styles.field}`} value={step} onChange={(e) => setStep(e.target.value)} placeholder={t("shell.acceptStepPlaceholder")} />
    </Frame>
  );
}
