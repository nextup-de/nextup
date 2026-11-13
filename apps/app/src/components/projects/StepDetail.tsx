"use client";
// One card of the board, opened: what it is, who owns it, when it is due, the details, the tool it
// lives in, everything that happened to it, and the moves - the way to move a card without dragging
// (keyboard, phone). Each change is one project.step.* event; text and details save together.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useCaseNames } from "@/components/cases/useCaseNames";
import { newId } from "@/features/cases/events";
import { helpView } from "@/features/projects/measure-view";
import { HELP_TEXT_MAX } from "@/features/projects/result";
import { appendEventAction } from "@/server/actions/events";
import { PersonFace } from "@/components/ui/elements";
import { STEP_COLUMNS, type ReducedProject, type Step, type StepColumn } from "@/features/projects/types";
import { columnLabel, safeUrl, systemFrom, timelineOf, toolName, toolOf, TOOLS, type JiraRow } from "@/features/projects/views";
import { useFormat, useLocale, useT } from "@/i18n/client";
import { idViewerOf, teamOf, useRights, useSend, withIds } from "./parts";
import styles from "./Projects.module.css";

const DUE_QUICK = [
  { key: "common.today", days: 0 }, { key: "projects.quickDays3", days: 3 }, { key: "projects.quickWeek1", days: 7 }, { key: "projects.quickWeeks2", days: 14 },
] as const;

export function StepDetail({ p, s, jira, onClose }: { p: ReducedProject; s: Step; jira: JiraRow; onClose: () => void }) {
  const ctx = useDemo();
  const { act, S, f, seed, actorUserId, serverMode, tenant, showToast } = ctx;
  const router = useRouter();
  const names = useCaseNames();
  const t = useT();
  const locale = useLocale();
  const fmt = useFormat();
  const r = useRights(p);
  const send = useSend(p);
  const team = withIds(teamOf(p, seed.seats));
  const edit = r.editStep(s);
  const [text, setText] = useState(s.text);
  const [note, setNote] = useState(s.note);
  const [why, setWhy] = useState<string | null>(null);
  const [inDays, setInDays] = useState("");
  const [removing, setRemoving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askText, setAskText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkKey, setLinkKey] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const meOnTeam = team.find((m) => m.userId === actorUserId);
  const dirty = text.trim() !== s.text || note.trim() !== s.note;
  const change = (c: Parameters<typeof act.project.editStep>[2]) => send("project.step.edited", { stepId: s.id, ...c }, () => act.project.editStep(p.id, s.id, c));
  const move = (to: StepColumn, w?: string) => send("project.step.moved", { stepId: s.id, to, why: w }, () => act.project.moveStep(p.id, s.id, to, w));
  const save = () => {
    const c: { text?: string; note?: string } = {};
    if (text.trim() && text.trim() !== s.text) c.text = text.trim();
    if (note.trim() !== s.note) c.note = note.trim();
    if (Object.keys(c).length) change(c);
  };
  const late = s.dueDay !== null && s.column !== "done" && S.day > s.dueDay;
  const tool = s.external ? toolOf(s.external.system) : null;
  const href = safeUrl(s.external?.url);
  const badUrl = linkUrl.trim() !== "" && !safeUrl(linkUrl);
  // Ask the sponsor (plan RES, D19): the team asks for help on a step that is still open; every ask of this step and whether it was answered.
  const help = helpView(p, s, S, idViewerOf(ctx), names.roleTitle);
  const askSponsor = () => {
    const body = askText.trim();
    if (!body) return;
    const payload = { stepId: s.id, text: body };
    const went = send("project.help.asked", payload, () => {
      if (!serverMode) { act.project.askHelp(p.id, s.id, body); return; }
      void appendEventAction({ slug: tenant.slug, id: newId("e"), type: "project.help.asked", target: p.id, payload }).then((res) => {
        if (res.ok) router.refresh(); else showToast(res.error);
      });
    });
    if (went) { setAskText(""); setAsking(false); }
  };
  // Everything that happened to this card, oldest first.
  const ids = new Set(p.history.filter((e) => e.payload?.stepId === s.id).map((e) => e.id));
  const story = timelineOf(p, locale).filter((l) => ids.has(l.id));
  const cycle = s.startedDay !== null && s.doneDay !== null ? s.doneDay - s.startedDay : null;

  return (
    <div className={styles.sheetWrap}>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label={t("projects.closeStep")} tabIndex={-1} />
      <div ref={panel} className={styles.sheet} role="dialog" aria-modal="true" aria-label={s.text} tabIndex={-1}>
        <div className={styles.sheetHead}>
          <span className={styles.colPill} data-col={s.column}>{columnLabel(s.column, locale)}</span>
          {tool && s.external && (href
            ? <a href={href} target="_blank" rel="noreferrer noopener" className={styles.key}>{toolName(tool, locale)} · {s.external.key}</a>
            : <span className={styles.key}>{toolName(tool, locale)} · {s.external.key}</span>)}
          <button type="button" className={styles.sheetClose} onClick={onClose} aria-label={t("common.close")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className={styles.sheetBody}>
          {edit
            ? <textarea id={"step-title-" + s.id} className={`nh-input ${styles.sheetTitleInput}`} value={text} onChange={(e) => setText(e.target.value)} aria-label={t("projects.step")} maxLength={500} rows={2} />
            : <h2 id={"step-title-" + s.id} className={styles.sheetTitle}>{s.text}</h2>}

          {r.moveStep(s) && (
            <div className={styles.sheetField}>
              <span className={styles.fieldLabel}>{t("projects.moveTo")}</span>
              <div className={styles.segment} role="group" aria-label={t("projects.moveTo")}>
                {STEP_COLUMNS.map((c) => (
                  <button
                    key={c} type="button" className={styles.segBtn} data-col={c} aria-pressed={s.column === c} disabled={s.column === c}
                    onClick={() => (c === "blocked" ? setWhy("") : move(c))} aria-label={t("projects.moveStepTo", { text: s.text, column: columnLabel(c, locale) })}
                  >
                    {columnLabel(c, locale)}
                  </button>
                ))}
              </div>
              {why !== null && (
                <form className={styles.whyForm} onSubmit={(e) => { e.preventDefault(); if (why.trim() && move("blocked", why.trim())) setWhy(null); }}>
                  <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("projects.whatBlocks")} aria-label={t("projects.whatBlocks")} autoFocus />
                  <span className={styles.actionRow}>
                    <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!why.trim()}>{t("projects.markBlocked")}</button>
                    <button type="button" className={styles.quiet} onClick={() => setWhy(null)}>{t("common.cancel")}</button>
                  </span>
                </form>
              )}
            </div>
          )}
          {s.column === "blocked" && s.why && <div className={styles.blockedWhy}>{t("projects.blockedWhy", { why: s.why })}</div>}

          <div className={styles.sheetGrid}>
            <div className={styles.sheetField}>
              <span className={styles.fieldLabel}>{t("projects.owner")}</span>
              {edit ? (
                <span className={styles.actionRow}>
                  <select className={`nh-input nh-select ${styles.input}`} value={s.ownerUserId ?? ""} onChange={(e) => { const m = team.find((x) => x.userId === e.target.value); change({ owner: m?.name ?? "", ownerUserId: m?.userId ?? null }); }} aria-label={t("projects.owner")}>
                    <option value="">{t("projects.noOwner")}</option>
                    {team.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                  </select>
                  {meOnTeam && s.ownerUserId !== meOnTeam.userId && <button type="button" className={styles.quietLink} onClick={() => change({ owner: meOnTeam.name, ownerUserId: meOnTeam.userId })}>{t("projects.takeIt")}</button>}
                </span>
              ) : (
                <span className={styles.owner}>{s.owner ? <><PersonFace name={s.owner} size="sm" />{s.owner}</> : t("projects.noOwner")}</span>
              )}
            </div>
            {(s.dueDay !== null || edit) && <div className={styles.sheetField}>
              <span className={styles.fieldLabel}>{t("projects.due")}</span>
              {s.dueDay !== null && <span className={styles.dueNow} data-late={late ? "true" : undefined}>
                {late ? t("projects.lateSince", { day: f(s.dueDay) }) : f(s.dueDay)}
              </span>}
              {edit && (
                <span className={styles.chipRow}>
                  {DUE_QUICK.map((q) => (
                    <button key={q.days} type="button" className={styles.chipBtn} onClick={() => change({ dueDay: S.day + q.days })}>{t(q.key)}</button>
                  ))}
                  <form className={styles.inlineDays} onSubmit={(e) => { e.preventDefault(); const n = Math.round(Number(inDays)); if (inDays.trim() && Number.isFinite(n) && n >= 0) { change({ dueDay: S.day + n }); setInDays(""); } }}>
                    <input className={`nh-input ${styles.input} ${styles.tinyInput}`} type="number" min={0} max={365} value={inDays} onChange={(e) => setInDays(e.target.value)} placeholder={t("projects.daysPlaceholder")} aria-label={t("projects.dueInHowMany")} />
                  </form>
                  {s.dueDay !== null && <button type="button" className={styles.chipBtn} onClick={() => change({ dueDay: null })}>{t("projects.none")}</button>}
                </span>
              )}
            </div>}
          </div>

          <div className={styles.sheetField}>
            <label className={styles.fieldLabel} htmlFor={"step-note-" + s.id}>{t("projects.details")}</label>
            {edit
              ? <textarea id={"step-note-" + s.id} className={`nh-input nh-textarea ${styles.textarea}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("projects.detailsPlaceholder")} maxLength={2000} />
              : <p className={styles.originBody}>{s.note || <span className={styles.muted}>{t("projects.noDetails")}</span>}</p>}
          </div>
          {edit && (
            <span className={styles.actionRow}>
              <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!dirty || !text.trim()} onClick={save}>{t("projects.saveChanges")}</button>
              {dirty && <button type="button" className={styles.quiet} onClick={() => { setText(s.text); setNote(s.note); }}>{t("projects.undo")}</button>}
            </span>
          )}

          <div className={styles.sheetField}>
            <span className={styles.fieldLabel}>{t("projects.inATool")}</span>
            {s.external
              ? <span className={styles.muted}>{tool ? toolName(tool, locale) : ""} {s.external.key}{tool?.id === "jira" && jira.state !== "off" ? " · " + t("projects.statusComesBack") : ""}</span>
              : <span className={styles.muted}>{jira.waiting ? t("projects.waitingForJira") : t("projects.notLinked")}</span>}
            {r.link && (
              <form className={styles.inline} aria-label={t("projects.linkThisStep")} onSubmit={(e) => {
                e.preventDefault();
                if (badUrl) return;
                const url = linkUrl.trim();
                const k = linkKey.trim();
                if (send("project.linked", { url, key: k }, () => act.project.link(p.id, url, systemFrom(url, k), k || undefined, s.id))) { setLinkUrl(""); setLinkKey(""); }
              }}>
                <input className={`nh-input ${styles.input} ${styles.grow}`} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder={t("projects.ticketAddressPlaceholder")} aria-label={t("projects.ticketAddress")} aria-invalid={badUrl ? "true" : undefined} />
                <input className={`nh-input ${styles.input} ${styles.keyInput}`} value={linkKey} onChange={(e) => setLinkKey(e.target.value)} placeholder={t("projects.ticketKeyPlaceholder14")} aria-label={t("projects.ticketKey")} />
                <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={(!linkUrl.trim() && !linkKey.trim()) || badUrl}>{t("projects.linkBtn")}</button>
                {badUrl && <span className="nh-error">{t("projects.onlyHttp")}</span>}
                {linkUrl.trim() && !badUrl && <span className={styles.hint}>{t("projects.goesTo", { tool: toolName(toolOf(systemFrom(linkUrl, linkKey)), locale) })}{TOOLS.some((x) => x.id === systemFrom(linkUrl, linkKey)) ? "" : " " + t("projects.plainLink")}</span>}
              </form>
            )}
          </div>

          {(help.canAsk || help.asks.length > 0) && (
            <div className={styles.sheetField} data-testid="step-help">
              {help.asks.map((a) => (
                <p key={a.day + a.text} className={styles.muted}>
                  {t("projectResult.askSponsorSent", { who: a.toName, date: f(a.day) })}: {a.text}
                  {a.answeredDay !== null && " · " + t("projectResult.askSponsorAnswered", { date: f(a.answeredDay) })}
                </p>
              ))}
              {help.canAsk && !asking && <button type="button" className={styles.quiet} onClick={() => setAsking(true)}>{t("projectResult.askSponsor")}</button>}
              {help.canAsk && asking && (
                <form className={styles.inline} aria-label={t("projectResult.askSponsor")} onSubmit={(e) => { e.preventDefault(); askSponsor(); }}>
                  <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={askText} onChange={(e) => setAskText(e.target.value)} maxLength={HELP_TEXT_MAX} aria-label={t("projectResult.askSponsorText")} placeholder={t("projectResult.askSponsorText")} autoFocus />
                  <span className={styles.actionRow}>
                    <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!askText.trim()}>{t("projectResult.askSponsorSend")}</button>
                    <button type="button" className={styles.quiet} onClick={() => { setAsking(false); setAskText(""); }}>{t("common.cancel")}</button>
                  </span>
                </form>
              )}
            </div>
          )}

          <dl className={styles.stepFacts}>
            <dt>{t("projects.added")}</dt><dd>{t("projects.addedBy", { day: f(s.addedDay), name: s.by })}</dd>
            <dt>{t("projects.inColumn", { column: columnLabel(s.column, locale) })}</dt><dd>{t("projects.sinceDay", { day: f(s.movedDay) })}{S.day - s.movedDay > 0 ? " · " + fmt.days(S.day - s.movedDay) : ""}</dd>
            {cycle !== null && <><dt>{t("projects.cycleTime")}</dt><dd>{cycle === 0 ? t("projects.cycleSameDay") : t("projects.cycleDays", { days: fmt.days(cycle) })}</dd></>}
          </dl>

          {story.length > 0 && (
            <div className={styles.sheetField}>
              <span className={styles.fieldLabel}>{t("projects.history")}</span>
              <ol className={styles.timeline}>
                {story.map((l) => (
                  <li key={l.id} className={styles.tl}><span className={styles.tlDay}>{f(l.day)}</span><span><span className={styles.strong}>{l.by}</span> {l.text}</span></li>
                ))}
              </ol>
            </div>
          )}

          {r.removeStep(s) && (
            <div className={styles.sheetFoot}>
              {!removing
                ? <button type="button" className={styles.quiet} onClick={() => setRemoving(true)}>{t("projects.removeStep")}</button>
                : (
                  <span className={styles.actionRow}>
                    <span className={styles.muted}>{t("projects.removeAsk")}</span>
                    <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => { if (change({ removed: true })) onClose(); }}>{t("projects.removeYes")}</button>
                    <button type="button" className={styles.quiet} onClick={() => setRemoving(false)}>{t("projects.keepIt")}</button>
                  </span>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
