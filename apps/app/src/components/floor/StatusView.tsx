"use client";
// Read an answer by reference (plan FLR, D8, D12): eight digits on the floor keypad, or the number the
// slip's QR carries after the "#". The fragment is read here, posted, and wiped from the address bar.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useFormat, useT } from "@/i18n/client";
import { floorReplyAction, floorStatusAction } from "@/server/actions/floor-status";
import type { StatusView as View } from "@/features/floor/status";
import { ProgressBar } from "@/components/ui/elements";
import { FloorKeypad } from "./FloorKeypad";
import floor from "./Floor.module.css";
import styles from "./StatusView.module.css";

const LENGTH = 8;
const STEP_INDEX = { sent: 0, read: 1, asked: 1, handed: 1, decided: 2 } as const;

export function StatusView({ slug }: { slug: string }) {
  const t = useT();
  const format = useFormat();
  const [digits, setDigits] = useState("");
  const [shown, setShown] = useState<{ reference: string; view: View; raisedOn: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [reply, setReply] = useState("");
  const [replied, setReplied] = useState(false);
  const [pending, start] = useTransition();
  const fromHash = useRef(false);

  const look = useCallback((reference: string, keepReplied = false) => {
    setError(null);
    start(async () => {
      const res = await floorStatusAction(slug, reference);
      if (res.ok) {
        setShown({ reference, view: res.view, raisedOn: res.raisedOn });
        if (!keepReplied) setReplied(false);
        setReply("");
        return;
      }
      setDigits("");
      if (res.reason === "limited") setLocked(true);
      setError(res.reason === "limited" ? (res.message ?? t("floor.statusUnknown")) : t("floor.statusUnknown"));
    });
  }, [slug, t]);

  useEffect(() => {
    if (fromHash.current) return;
    fromHash.current = true;
    const hash = window.location.hash.replace(/^#/, "");
    if (!/^\d{8}$/.test(hash)) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    queueMicrotask(() => look(hash));
  }, [look]);

  const send = () => {
    if (!shown) return;
    setError(null);
    start(async () => {
      const res = await floorReplyAction(slug, shown.reference, reply);
      if (res.ok) {
        setReplied(true);
        look(shown.reference, true);
        return;
      }
      setError(res.reason === "closed" ? t("floor.statusReplyClosed") : (res.message ?? t("floor.statusReplyFailed")));
    });
  };

  if (!shown) {
    return (
      <div className={styles.wrap} data-testid="floor-status-enter">
        <h1 className={floor.heading}>{t("floor.statusHeading")}</h1>
        <p className={floor.hint}>{t("floor.statusReference")}</p>
        <FloorKeypad value={digits} onChange={setDigits} length={LENGTH} actionLabel={t("floor.statusShow")} onAction={() => look(digits)} disabled={pending || locked} />
        {error ? <p className={floor.error} role="alert" data-testid="floor-status-error">{error}</p> : null}
      </div>
    );
  }

  const { view } = shown;
  const at = STEP_INDEX[view.step];
  const names = [t("floor.statusStepSent"), t("floor.statusStepDesk"), t("floor.statusStepAnswered")];
  const role = view.roleTitle ?? "";
  const meta = [view.area, t("floor.statusRaised", { date: format.date(shown.raisedOn, "day") })].filter(Boolean).join(" · ");
  return (
    <div className={styles.wrap} data-testid="floor-status-view">
      <h1 className={floor.heading}>{view.title}</h1>
      <p className={floor.place}>{meta}</p>
      <ProgressBar done={at === 2 ? 3 : at} doing={at === 2 ? 0 : 1} open={at === 2 ? 0 : 2 - at} label={names[at]} />
      <div className={styles.steps} aria-hidden="true">{names.map((n) => <span key={n}>{n}</span>)}</div>

      {view.decision ? (
        <div className={floor.panel} data-testid="floor-status-decision">
          <p className={styles.answer}>{view.decision.answer === "yes" ? t("floor.statusYes") : t("floor.statusNo")}</p>
          {view.decision.reason ? <p className={floor.body}>{view.decision.reason}</p> : null}
          {role ? <p className={floor.hint}>{role}</p> : null}
        </div>
      ) : view.question ? (
        <div className={floor.panel} data-testid="floor-status-question">
          <p className={floor.hint}>{t("floor.statusQuestion", { role })}</p>
          <p className={floor.body}>{view.question.text}</p>
        </div>
      ) : view.step === "handed" ? (
        <p className={floor.body} data-testid="floor-status-handed">{t("floor.statusHanded", { role })}</p>
      ) : (
        <p className={floor.body} data-testid="floor-status-waiting">{t("floor.statusWaiting", { role })}</p>
      )}

      {view.question ? (
        <>
          <label className={floor.label}>
            {t("floor.statusReplyLabel")}
            <textarea className={floor.textarea} value={reply} maxLength={1000} onChange={(e) => setReply(e.target.value)} data-testid="floor-status-reply" />
          </label>
          <button type="button" className={floor.main} disabled={pending || reply.trim().length === 0} onClick={send} data-testid="floor-status-send">{t("floor.statusReplySend")}</button>
        </>
      ) : null}
      {replied && !view.question ? <p className={floor.hint} data-testid="floor-status-replied">{t("floor.statusReplySent")}</p> : null}
      {error ? <p className={floor.error} role="alert" data-testid="floor-status-error">{error}</p> : null}
      <button type="button" className={floor.second} onClick={() => { setShown(null); setDigits(""); setError(null); }} data-testid="floor-status-another">{t("floor.statusAnother")}</button>
    </div>
  );
}
