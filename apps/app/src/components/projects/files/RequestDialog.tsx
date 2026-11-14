"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { newId } from "@/features/cases/events";
import { folderLink, requestIssue, requestable, requestSteps, rt, type Person, type RequestKey, type RequestMode } from "@/features/files/request";
import { useLocale, useT } from "@/i18n/client";
import { teamOf, useSend, withIds } from "../parts";
import { useDayMap } from "../plan/calendar/days";
import { trailOf } from "./Breadcrumb";
import type { FilesPartProps } from "./types";
import styles from "./Request.module.css";

/** Request files (5.4): ask project members; it creates a step per person (or one shared step) with the folder linked. */
export function RequestDialog({ state, actions }: FilesPartProps) {
  return <div data-testid="files-request-dialog">{state.dialog?.kind === "request" && <Form state={state} actions={actions} />}</div>;
}

function Form({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const { act, seed, showToast } = useDemo();
  const { p, folder } = state;
  const send = useSend(p);
  const map = useDayMap();
  const everyone = requestable(p, withIds(teamOf(p, seed.seats)));
  const [chosen, setChosen] = useState<Person[]>([]);
  const [what, setWhat] = useState("");
  const [by, setBy] = useState("");
  const [mode, setMode] = useState<RequestMode>("each");
  const [issue, setIssue] = useState<RequestKey | null>(null);
  const [busy, setBusy] = useState(false);
  const x = (key: RequestKey, params?: Record<string, string | number>) => rt(locale, key, params);
  const folderName = state.path.at(-1) ?? trailOf(folder?.url).at(-1) ?? "";
  const free = everyone.filter((person) => !chosen.some((c) => c.userId === person.userId));

  const submit = () => {
    const dueDay = by ? map.dayOf(by) : null;
    if (by && dueDay === null) { setIssue("badDay"); return; }
    const input = { people: chosen, what, dueDay, mode, folder: folderName };
    const problem = requestIssue(p, input);
    if (problem) { setIssue(problem === "people" ? "issuePeople" : problem === "what" ? "issueWhat" : problem === "folder" ? "issueFolder" : "issueNotMember"); return; }
    setBusy(true);
    const payloads = requestSteps(input, (w, f) => x("stepTitle", { what: w, folder: f }), (names) => x("sharedNote", { names }), (prefix) => newId(prefix));
    let made = 0;
    for (const pl of payloads) {
      const went = send("project.step.added", pl, () => {
        const id = act.project.addStep(p.id, pl.text, pl.owner, pl.dueDay, pl.to, pl.note, pl.ownerUserId ?? null);
        if (folder) { const link = folderLink(folder.url, id); act.project.link(p.id, link.url, link.system, undefined, link.stepId); }
      });
      if (!went) break;
      made++;
    }
    setBusy(false);
    if (made === 0) return;
    showToast(x("toast", { count: made }));
    actions.closeDialog();
  };

  return <div className={styles.scrim}>
    <form className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="files-request-title" aria-busy={busy}
      onSubmit={(e) => { e.preventDefault(); submit(); }} onKeyDown={(e) => { if (e.key === "Escape" && !busy) actions.closeDialog(); }}>
      <header className={styles.head}>
        <div>
          <h2 id="files-request-title">{t("projectFiles.reqTitle")}</h2>
          <p className={styles.sub}>{t("projectFiles.reqSub", { folder: folderName })}</p>
        </div>
        <button type="button" className={styles.close} aria-label={t("projectFiles.close")} disabled={busy} onClick={actions.closeDialog}>×</button>
      </header>
      <div className={styles.body}>
        <fieldset className={styles.field}>
          <legend>{t("projectFiles.requestWho")}</legend>
          <div className={styles.people}>
            {chosen.map((person) => <span key={person.userId} className={styles.person}>
              <PersonFace name={person.name} size="sm" />{person.name}
              <button type="button" aria-label={x("remove", { name: person.name })} onClick={() => setChosen(chosen.filter((c) => c.userId !== person.userId))}>×</button>
            </span>)}
            <select className="nh-input" aria-label={x("pickLabel")} value="" onChange={(e) => { const next = free.find((person) => person.userId === e.target.value); if (next) { setChosen([...chosen, next]); setIssue(null); } }} disabled={free.length === 0}>
              <option value="">{x("pickPeople")}</option>
              {free.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
            </select>
          </div>
        </fieldset>
        <label className={styles.field}><span>{t("projectFiles.requestWhat")}</span>
          <textarea className="nh-input" rows={3} maxLength={400} value={what} placeholder={x("whatPlaceholder")} onChange={(e) => { setWhat(e.target.value); setIssue(null); }} />
        </label>
        <div className={styles.pair}>
          <label className={styles.field}><span>{t("projectFiles.reqBy")}</span><input className="nh-input" type="date" value={by} onChange={(e) => { setBy(e.target.value); setIssue(null); }} /></label>
          <label className={styles.field}><span>{t("projectFiles.reqShowAs")}</span>
            <select className="nh-input" value={mode} onChange={(e) => setMode(e.target.value as RequestMode)}>
              <option value="each">{t("projectFiles.reqStepEach")}</option>
              <option value="shared">{x("sharedStep")}</option>
            </select>
          </label>
        </div>
        <p className={styles.note}>{t("projectFiles.reqNote")}</p>
        {issue && <p className={styles.error} role="alert">{issue === "badDay" ? x("badDay") : x(issue)}</p>}
      </div>
      <footer className={styles.foot}>
        <button type="button" className="nh-btn" disabled={busy} onClick={actions.closeDialog}>{t("projectFiles.cancel")}</button>
        <button type="submit" className="nh-btn nh-btn-primary" disabled={busy}>{t("projectFiles.requestSend")}</button>
      </footer>
    </form>
  </div>;
}
