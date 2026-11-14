"use client";
// Make it a step: one project.request.stepped, and the dialog stays busy until it has gone (plan REQ, D6).
import { useMemo, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { dateOfWorkday, isWorkday, workdayOf } from "@/features/clock/calendar";
import { stepDraft, type RequestRow } from "@/features/projects/requests-view";
import type { ReducedProject, StepColumn } from "@/features/projects/types";
import { columnLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { teamOf, useRights, withIds } from "../../parts";
import dialog from "../../steps/CreateStepDialog.module.css";
import { useText } from "./useText";
import styles from "./Inbox.module.css";

const COLUMNS: StepColumn[] = ["todo", "doing", "done"];

type Props = { p: ReducedProject; row: RequestRow; name: string; onClose: () => void; onDone: () => void };

export function StepDialog({ p, row, name, onClose, onDone }: Props) {
  const { act, S, seed, actorUserId, showToast } = useDemo();
  const t = useT();
  const locale = useLocale();
  const { text } = useText();
  const { check } = useRights(p);
  const draft = useMemo(() => stepDraft(row.request, row.form), [row]);
  const team = useMemo(() => withIds(teamOf(p, seed.seats)), [p, seed.seats]);
  const [title, setTitle] = useState(draft.title);
  const [column, setColumn] = useState<StepColumn>(draft.column);
  const [ownerUserId, setOwnerUserId] = useState(actorUserId && team.some((x) => x.userId === actorUserId) ? actorUserId : "");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const calendar = seed.clock.mode === "workdays" ? seed.clock.calendar : null;
  const todayIso = () => {
    if (calendar) return S.day >= 1 ? dateOfWorkday(S.day, calendar) : "";
    return new Date().toISOString().slice(0, 10);
  };
  const dayForDate = (date: string): number | null => {
    if (!date) return null;
    if (calendar) {
      const day = workdayOf(new Date(`${date}T12:00:00Z`), calendar);
      return isWorkday(date, calendar) && dateOfWorkday(day, calendar) === date ? day : null;
    }
    return S.day + Math.round((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${todayIso()}T12:00:00Z`).getTime()) / 86_400_000);
  };
  const dueDay = dayForDate(dueDate);
  const badDate = dueDate !== "" && dueDay === null;
  const owner = team.find((x) => x.userId === ownerUserId);
  const quote = row.answers[0]?.value ?? "";

  const submit = async () => {
    if (busy || !title.trim() || badDate) return;
    const step = { text: title.trim(), column, ...(owner ? { ownerUserId: owner.userId } : {}), ...(dueDay !== null ? { dueDay } : {}), ...(draft.note ? { note: draft.note } : {}) };
    setBusy(true);
    // The id is minted by the act; the rights are asked first with a probe id the server never sees.
    const verdict = check("project.request.stepped", { requestId: row.request.id, step: { stepId: "probe", ...step } });
    if (!verdict.ok) { showToast(verdict.error); setBusy(false); return; }
    // Busy until the server has answered; a refusal shows as the act's own toast and keeps the dialog open.
    const result = await act.project.request.step(p.id, row.request.id, step);
    if (result.ok) onDone(); else setBusy(false);
  };

  return (
    <div className={dialog.overlay}>
      <button type="button" className={dialog.scrim} onClick={onClose} aria-label={text("stepClose")} tabIndex={-1} />
      <section className={dialog.dialog} role="dialog" aria-modal="true" aria-labelledby={"step-from-" + row.request.id} aria-busy={busy} onKeyDown={(e) => { if (e.key === "Escape" && !busy) onClose(); }}>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <header className={dialog.header}>
            <h2 id={"step-from-" + row.request.id}>{text("stepTitle")}</h2>
            <button type="button" className={dialog.close} onClick={onClose} disabled={busy} aria-label={text("stepClose")}>×</button>
          </header>
          <div className={dialog.body}>
            <p className={styles.quote}>{text("stepFrom")} <strong>{name}</strong>{quote ? <>: “{quote.length > 90 ? quote.slice(0, 90) + "…" : quote}”</> : null}</p>
            <input className={`nh-input ${dialog.title}`} autoFocus maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t("projectRequests.requestStepTitle")} />
            <div className={dialog.fields}>
              <label className={dialog.field}>
                <span>{t("projectRequests.requestStepColumn")}</span>
                <select className="nh-input nh-select" value={column} onChange={(e) => setColumn(e.target.value as StepColumn)}>
                  {COLUMNS.map((c) => <option key={c} value={c}>{columnLabel(c, locale)}</option>)}
                </select>
              </label>
              <label className={dialog.field}>
                <span>{t("projectRequests.requestStepOwner")}</span>
                <span className={dialog.ownerControl}>
                  {owner && <PersonFace name={owner.name} size="sm" />}
                  <select className="nh-input nh-select" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
                    <option value="">{text("stepNoOwner")}</option>
                    {team.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}
                  </select>
                </span>
              </label>
              <label className={dialog.field}>
                <span>{t("projectRequests.requestStepDue")}</span>
                <span className={dialog.dateControl} data-empty={!dueDate}>
                  <input type="date" min={todayIso()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label={t("projectRequests.requestStepDue")} />
                  {!dueDate && <span>{text("stepAddDate")}</span>}
                </span>
                {badDate && <span className={dialog.error}>{text("stepBadDate")}</span>}
              </label>
            </div>
            <p className={styles.sees}>{text("stepSees", { name })}</p>
          </div>
          <footer className={dialog.footer}>
            <span className={dialog.spacer} />
            <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={onClose} disabled={busy}>{text("stepCancel")}</button>
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={busy || !title.trim() || badDate}>{busy ? text("stepBusy") : t("projectRequests.requestMakeStep")}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
