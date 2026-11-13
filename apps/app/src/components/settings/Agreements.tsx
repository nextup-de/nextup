"use client";
// Settings -> Go-live, the Agreements card (Q9.4): what was signed outside NextUp, one row per kind with its
// record, and a small form to record it. The rule of what is needed lives in features/pilot/agreements.ts; the
// server checks the fields again and writes the audit row.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SectionCard } from "@/components/ui/elements";
import {
  AGREEMENT_KINDS, AGREEMENT_NAME, NOT_NEEDED_ALLOWED, REASON_MAX, SIGNER_MAX, neededKinds,
  type AgreementKind, type AgreementRecord, type Agreements as AgreementsMap,
} from "@/features/pilot/agreements";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { recordAgreementAction, type AgreementResult } from "@/server/actions/settings/agreements";
import s from "./settings.module.css";
import styles from "./Agreements.module.css";

type Props = {
  slug: string;
  agreements: AgreementsMap;
  aiOn: boolean;
  /** After a save: the page checks again, so the checklist shows the new state. */
  onSaved: () => void;
};

const ERROR: Record<Exclude<AgreementResult, { ok: true }>["reason"], MessageKey> = {
  date: "settingsGoLive.agreementErrDate", future: "settingsGoLive.agreementErrFuture", signer: "settingsGoLive.agreementErrSigner",
  reason: "settingsGoLive.agreementErrReason", kind: "settingsGoLive.agreementErrFailed", status: "settingsGoLive.agreementErrFailed",
  forbidden: "settingsGoLive.agreementErrFailed", failed: "settingsGoLive.agreementErrFailed",
};

function needOf(kind: AgreementKind, aiOn: boolean): MessageKey {
  if (kind === "dpa") return "settingsGoLive.agreementNeedAlways";
  if (kind === "works") return "settingsGoLive.agreementNeedCouncil";
  if (kind === "aiInfo") return aiOn ? "settingsGoLive.agreementNeedAi" : "settingsGoLive.agreementNeedAiOff";
  return "settingsGoLive.agreementOptional";
}

function Form({ slug, kind, record, onDone, onCancel }: { slug: string; kind: AgreementKind; record: AgreementRecord | undefined; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [status, setStatus] = useState<"signed" | "notNeeded">(record?.status ?? "signed");
  const [date, setDate] = useState(record?.status === "signed" ? record.date : "");
  const [signer, setSigner] = useState(record?.status === "signed" ? record.signer : "");
  const [reason, setReason] = useState(record?.status === "notNeeded" ? record.reason : "");
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const notNeeded = NOT_NEEDED_ALLOWED[kind];
  const id = (f: string) => `agreement-${kind}-${f}`;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await recordAgreementAction(slug, status === "signed" ? { kind, status, date, signer } : { kind, status, reason });
      if (!r.ok) return setError(ERROR[r.reason]);
      setError(null);
      onDone();
    });
  };

  return (
    <form className={styles.form} onSubmit={save} data-testid={`settings-agreement-form-${kind}`}>
      {notNeeded ? (
        <fieldset className={styles.choice}>
          <label><input type="radio" name={id("status")} checked={status === "signed"} onChange={() => setStatus("signed")} /> {t("settingsGoLive.agreementStatusSigned")}</label>
          <label><input type="radio" name={id("status")} checked={status === "notNeeded"} onChange={() => setStatus("notNeeded")} data-testid={`settings-agreement-notneeded-${kind}`} /> {t(kind === "works" ? "settingsGoLive.agreementStatusNoCouncil" : "settingsGoLive.agreementStatusNotNeeded")}</label>
        </fieldset>
      ) : null}
      {status === "signed" ? (
        <div className={styles.fields}>
          <label className={styles.field} htmlFor={id("date")}>
            <span>{t("settingsGoLive.agreementDate")}</span>
            <input id={id("date")} className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} required data-testid={`settings-agreement-date-${kind}`} />
          </label>
          <label className={styles.field} htmlFor={id("signer")}>
            <span>{t("settingsGoLive.agreementSigner")}</span>
            <input id={id("signer")} className={s.input} value={signer} maxLength={SIGNER_MAX} onChange={(e) => setSigner(e.target.value)} required aria-describedby={id("signer-hint")} data-testid={`settings-agreement-signer-${kind}`} />
            <span id={id("signer-hint")} className={s.help}>{t("settingsGoLive.agreementSignerHint")}</span>
          </label>
        </div>
      ) : (
        <label className={styles.field} htmlFor={id("reason")}>
          <span>{t("settingsGoLive.agreementReason")}</span>
          <input id={id("reason")} className={s.input} value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} required data-testid={`settings-agreement-reason-${kind}`} />
        </label>
      )}
      {error ? <p className={s.fieldError} role="alert">{t(error)}</p> : null}
      <div className={styles.buttons}>
        <button type="submit" className={s.save} disabled={pending} data-testid={`settings-agreement-save-${kind}`}>{t("settingsGoLive.agreementSave")}</button>
        <button type="button" className={s.soft} disabled={pending} onClick={onCancel}>{t("settingsGoLive.agreementCancel")}</button>
      </div>
    </form>
  );
}

export function Agreements({ slug, agreements, aiOn, onSaved }: Props) {
  const t = useT();
  const f = useFormat();
  const router = useRouter();
  const [editing, setEditing] = useState<AgreementKind | null>(null);
  const needed = new Set(neededKinds(agreements, aiOn));

  const state = (r: AgreementRecord | undefined) => {
    if (!r) return t("settingsGoLive.agreementNone");
    if (r.status === "signed") return t("settingsGoLive.agreementSigned", { date: f.date(r.date, "day"), signer: r.signer });
    return t(r.kind === "works" ? "settingsGoLive.agreementNoCouncil" : "settingsGoLive.agreementNotNeeded", { reason: r.reason });
  };

  return (
    <div id="agreements">
      <SectionCard name="agreements" title={t("settingsGoLive.agreementsTitle")} hint={t("settingsGoLive.agreementsLede")}>
        <ul className={styles.rows} data-testid="settings-agreements">
          {AGREEMENT_KINDS.map((kind) => {
            const r = agreements[kind];
            const missing = needed.has(kind) && r?.status !== "signed";
            return (
              <li key={kind} className={styles.row} data-testid={`settings-agreement-${kind}`} data-state={missing ? "needs" : r ? "done" : "unset"}>
                <div className={styles.head}>
                  <span className={styles.name}>{t(AGREEMENT_NAME[kind])}</span>
                  <span className={styles.need}>{t(needOf(kind, aiOn))}</span>
                </div>
                <div className={styles.value}>
                  <span data-testid={`settings-agreement-state-${kind}`}>{state(r)}</span>
                  {r ? <span className={styles.at}>{t("settingsGoLive.agreementRecordedAt", { date: f.date(r.at, "day") })}</span> : null}
                </div>
                {editing === kind ? null : (
                  <button type="button" className={s.soft} onClick={() => setEditing(kind)} data-testid={`settings-agreement-edit-${kind}`}>
                    {t(r ? "settingsGoLive.agreementChange" : "settingsGoLive.agreementRecord")}
                  </button>
                )}
                {editing === kind ? (
                  <Form slug={slug} kind={kind} record={r} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); router.refresh(); onSaved(); }} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}
