"use client";
// The hint under the No sheet's reason field (plan AGT, D24, D25): a quiet link that checks the reason with AI. It shows only when the server says the
// hint is there for this person and case (flag, gate, desk or manager), answers below the field - "Looks clear" or one sentence - and shows nothing when
// the call fails. It never disables Send, never changes the reason and stores nothing; what the brain wrote is text, never markup.
import { useEffect, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useT } from "@/i18n/client";
import { reasonHintAction, reasonHintAvailableAction } from "@/server/agent/hint";
import styles from "./ReasonHint.module.css";

export function ReasonHint({ caseId, category, reason }: { caseId: string; category: string | null; reason: string }) {
  const { tenant, serverMode, flag } = useDemo();
  const t = useT();
  const slug = tenant.slug;
  const on = serverMode && flag("agent");
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  useEffect(() => {
    if (!on) return;
    let gone = false;
    reasonHintAvailableAction(slug, caseId).then((ok) => { if (!gone) setAvailable(ok); }, () => undefined);
    return () => { gone = true; };
  }, [on, slug, caseId]);

  if (!on || !available) return null;
  const check = async () => {
    setBusy(true);
    setAnswer(null);
    try {
      const res = await reasonHintAction(slug, caseId, category ?? "", reason);
      setAnswer(res === null ? null : "hint" in res ? res.hint : t("projectAgent.hintClear"));
    } catch {
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.hint}>
      <button type="button" className={styles.link} onClick={() => void check()} disabled={busy || reason.trim() === ""} data-testid="reason-hint-link">{t("projectAgent.hintLink")}</button>
      {answer !== null && <p className={styles.answer} role="status" data-testid="reason-hint-answer">{answer}</p>}
    </div>
  );
}
