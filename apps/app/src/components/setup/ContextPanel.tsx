"use client";
// The company context draft on setup's Company step (Paper: "Pilot 02 · Routing and setup"): what is connected,
// the start button, the wait, and the review. A review's fields sit in this card and belong to the step's form
// through `form`, because saveCompanyAction replaces the whole profile: an accepted field sends its text,
// any other sends what the profile holds now.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CONTEXT_FIELDS, type ContextDraft, type ContextError, type ContextField } from "@/features/settings/context-draft";
import type { CompanyForm } from "@/features/settings/company-forms";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { discardContextDraftAction, startContextRunAction, type ContextActionResult } from "@/server/actions/settings/setup-context";
import type { ContextPanelData } from "@/server/setup-context";
import settings from "@/components/settings/settings.module.css";
import { Refusal, StepCard } from "./parts";
import s from "./Setup.module.css";
import c from "./ContextPanel.module.css";

const POLL_MS = 5000;

const LABEL: Record<ContextField, MessageKey> = {
  vision: "settingsSetupContext.fieldVision",
  mission: "settingsSetupContext.fieldMission",
  principles: "settingsSetupContext.fieldPrinciples",
  businessModel: "settingsSetupContext.fieldBusinessModel",
  complianceRules: "settingsSetupContext.fieldComplianceRules",
};
const WHY: Record<ContextError, MessageKey> = {
  gate_closed: "settingsSetupContext.errGate",
  no_source: "settingsSetupContext.errSource",
  no_hits: "settingsSetupContext.errHits",
  model_failed: "settingsSetupContext.errModel",
  bad_answer: "settingsSetupContext.errAnswer",
  interrupted: "settingsSetupContext.errInterrupted",
  expired: "settingsSetupContext.expired",
};

/** The profile's value of a field as the form sends it. */
const profileValue = (p: CompanyForm["profile"], f: ContextField): string => (f === "principles" ? p.principles.join("\n") : p[f]);

/** The fields a draft proposes: the step's form leaves their hidden values to the review. */
export const draftedFields = (d: ContextPanelData): ContextField[] => CONTEXT_FIELDS.filter((f) => d.status === "ready" && d.draft?.fields[f]);

function useAct() {
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const run = (call: () => Promise<ContextActionResult>) => start(async () => {
    const r = await call();
    setError(r.ok ? null : r.error);
  });
  return { error, pending, run };
}

function Connected({ data }: { data: ContextPanelData }) {
  const t = useT();
  const yes = (on: boolean) => <span className={c.value} data-on={on || undefined}>{t(on ? "settingsSetupContext.on" : "settingsSetupContext.off")}</span>;
  const account = data.account === "connected" ? "settingsSetupContext.connected" : data.account === "renew" ? "settingsSetupContext.renew" : "settingsSetupContext.notConnected";
  return (
    <>
      <h3 className={s.subLabel}>{t("settingsSetupContext.connectedTitle")}</h3>
      <ul className={s.added} data-testid="setup-context-connected">
        <li className={c.row}><span>{t("settingsSetupContext.rowSource")}</span>{yes(data.sourceOn)}</li>
        <li className={c.row}>
          <span>{t("settingsSetupContext.rowAccount")}</span>
          <span className={c.value} data-on={data.account === "connected" || undefined}>{t(account)}</span>
        </li>
        <li className={c.row}><span>{t("settingsSetupContext.rowAi")}</span>{yes(data.aiOn)}</li>
      </ul>
    </>
  );
}

function Start({ slug, data, demo, again }: { slug: string; data: ContextPanelData; demo?: boolean; again?: boolean }) {
  const t = useT();
  const { error, pending, run } = useAct();
  const connected = data.account === "connected";
  return (
    <>
      <Connected data={data} />
      <p className={s.fieldHelp}>{t("settingsSetupContext.reads")}</p>
      {connected ? null : (
        <p className={c.notice} data-testid="setup-context-connect">
          {t("settingsSetupContext.connectFirst")} <a href={data.profileHref}>{t("settingsSetupContext.openProfile")}</a>
        </p>
      )}
      <Refusal error={error} />
      <div className={s.formFoot}>
        <span className={s.fieldHelp}>{t("settingsSetupContext.laterLine")}</span>
        <button type="button" className={c.primary} disabled={pending || demo || !connected} onClick={() => run(() => startContextRunAction(slug))} data-testid="setup-context-start">
          {pending ? t("settingsSetupContext.starting") : t(again ? "settingsSetupContext.startAgain" : "settingsSetupContext.start")}
        </button>
      </div>
    </>
  );
}

function Waiting({ data }: { data: ContextPanelData }) {
  const t = useT();
  const router = useRouter();
  // The run happens elsewhere; read again until it is over.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <div className={c.wait} role="status" data-testid="setup-context-running">
      <span className={c.pulse} aria-hidden="true" />
      <p className={c.waitText}>
        {t("settingsSetupContext.running")}{" "}
        {data.startedBy ? t("settingsSetupContext.runningBy", { name: data.startedBy }) : t("settingsSetupContext.runningSomeone")}
      </p>
    </div>
  );
}

function Proposal({ field, draft, now, text, accepted, onText, onToggle }: {
  field: ContextField; draft: ContextDraft; now: string; text: string; accepted: boolean;
  onText: (v: string) => void; onToggle: () => void;
}) {
  const t = useT();
  const cited = draft.fields[field]?.sources ?? [];
  const sources = draft.sources.filter((x) => cited.includes(x.id));
  const id = `context-${field}`;
  return (
    <li className={c.proposal} data-accepted={accepted || undefined} data-testid={`setup-context-field-${field}`}>
      <div className={c.proposalHead}>
        <label className={s.fieldLabel} htmlFor={id}>{t(LABEL[field])}</label>
        {accepted ? <span className={c.acceptedTag}>{t("settingsSetupContext.accepted")}</span> : null}
        <button type="button" className={s.textBtn} onClick={onToggle} data-testid={`setup-context-accept-${field}`}>
          {t(accepted ? "settingsSetupContext.undo" : "settingsSetupContext.accept")}
        </button>
      </div>
      <textarea id={id} className={settings.input} rows={field === "principles" || field === "complianceRules" ? 5 : 3} value={text} onChange={(e) => onText(e.target.value)} data-testid={`setup-context-text-${field}`} />
      {field === "principles" ? <span className={s.fieldHelp}>{t("settingsSetupContext.principlesHelp")}</span> : null}
      {now ? <p className={c.current}>{t("settingsSetupContext.current", { text: now.replaceAll("\n", " · ") })}</p> : null}
      <div className={c.sources}>
        <span className={c.sourcesLabel}>{t("settingsSetupContext.sources")}</span>
        <ul className={c.sourceList}>
          {sources.map((x) => (
            <li key={x.id}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a></li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function Review({ slug, formId, draft, profile, pending, demo, onDirty }: {
  slug: string; formId: string; draft: ContextDraft; profile: CompanyForm["profile"]; pending: boolean; demo?: boolean; onDirty: (dirty: boolean) => void;
}) {
  const t = useT();
  const act = useAct();
  const fields = CONTEXT_FIELDS.filter((f) => draft.fields[f]);
  const [texts, setTexts] = useState<Partial<Record<ContextField, string>>>(() => Object.fromEntries(fields.map((f) => [f, draft.fields[f]?.text ?? ""])));
  const [accepted, setAccepted] = useState<ContextField[]>([]);
  const on = (f: ContextField) => accepted.includes(f);
  const accept = (f: ContextField) => { setAccepted((a) => (a.includes(f) ? a : [...a, f])); onDirty(true); };
  const toggle = (f: ContextField) => {
    const next = on(f) ? accepted.filter((x) => x !== f) : [...accepted, f];
    setAccepted(next);
    onDirty(next.length > 0);
  };
  return (
    <>
      <h3 className={c.reviewTitle}>{t("settingsSetupContext.reviewTitle")}</h3>
      <p className={s.fieldHelp}>{t("settingsSetupContext.reviewText")}</p>
      <ul className={c.proposals}>
        {fields.map((f) => (
          <Proposal key={f} field={f} draft={draft} now={profileValue(profile, f)} text={texts[f] ?? ""} accepted={on(f)}
            onText={(v) => { setTexts((x) => ({ ...x, [f]: v })); accept(f); }} onToggle={() => toggle(f)} />
        ))}
      </ul>
      {fields.map((f) => <input key={f} type="hidden" form={formId} name={f} value={on(f) ? (texts[f] ?? "") : profileValue(profile, f)} />)}
      <input type="hidden" form={formId} name="contextAccepted" value={accepted.join(",")} />
      <p className={s.fieldHelp}>{t("settingsSetupContext.reviewShared")}</p>
      <Refusal error={act.error} />
      <div className={s.formFoot}>
        <button type="button" className={s.textBtn} disabled={act.pending || demo} onClick={() => { onDirty(false); act.run(() => discardContextDraftAction(slug)); }} data-testid="setup-context-discard">
          {act.pending ? t("settingsSetupContext.discarding") : t("settingsSetupContext.discard")}
        </button>
        <span className={c.saveSide}>
          {accepted.length === 0 ? <span className={s.fieldHelp}>{t("settingsSetupContext.noneAccepted")}</span> : null}
          <button type="submit" form={formId} className={c.primary} disabled={pending || demo || accepted.length === 0} data-testid="setup-context-save">
            {t("settingsSetupContext.saveAccepted")}
          </button>
        </span>
      </div>
    </>
  );
}

export function ContextPanel({ slug, formId, data, profile, pending, demo, onDirty }: {
  slug: string; formId: string; data: ContextPanelData; profile: CompanyForm["profile"]; pending: boolean; demo?: boolean; onDirty: (dirty: boolean) => void;
}) {
  const t = useT();
  const draft = data.status === "ready" ? data.draft : null;
  // A new draft, or one with fields taken out, starts its review afresh.
  const draftKey = draft ? `${data.finishedOn}:${CONTEXT_FIELDS.filter((f) => draft.fields[f]).join(",")}` : "";
  return (
    <div id="context" className={c.anchor} data-testid="setup-context" data-status={data.status}>
      <StepCard title={t("settingsSetupContext.title")} text={t("settingsSetupContext.text")}>
        {data.status === "notUsed" ? (
          <>
            <Connected data={data} />
            <p className={s.fieldHelp} data-testid="setup-context-not-used">{t("settingsSetupContext.notUsed")}</p>
          </>
        ) : null}
        {data.status === "idle" ? <Start slug={slug} data={data} demo={demo} /> : null}
        {data.status === "running" ? <Waiting data={data} /> : null}
        {data.status === "failed" ? (
          <>
            <div className={c.failed} role="alert" data-testid="setup-context-failed">
              <strong>{t("settingsSetupContext.failedTitle")}</strong>
              {data.error ? <span>{t(WHY[data.error])}</span> : null}
            </div>
            <Start slug={slug} data={data} demo={demo} again />
          </>
        ) : null}
        {draft ? <Review key={draftKey} slug={slug} formId={formId} draft={draft} profile={profile} pending={pending} demo={demo} onDirty={onDirty} /> : null}
        {data.status === "ready" && !draft ? (
          <>
            <p className={s.fieldHelp} data-testid="setup-context-settled">{t(data.reviewed ? "settingsSetupContext.reviewed" : "settingsSetupContext.expired")}</p>
            {data.sourceOn && data.aiOn ? <Start slug={slug} data={data} demo={demo} again /> : null}
          </>
        ) : null}
      </StepCard>
    </div>
  );
}
