"use client";
// /settings/privacy: the four cards of the Data and privacy page (GDP D18, spec 05). Company totals only (D7).
// Shortening a rule asks first and names how many rows the next run removes.
import { useState, useTransition } from "react";
import { DataTable, PersonFace, SectionCard } from "@/components/ui/elements";
import { fromRules, needsConfirm, shortened, toRuleInput, formErrors, type FormErrorKey, type PrivacyForm } from "@/features/privacy/privacy-form";
import type { RetentionKind } from "@/features/privacy/retention";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { requestExport, listExportsAction } from "@/server/actions/privacy-export";
import {
  previewRetention, saveRetentionAction, saveScreenshotsAction, type PrivacyPageData, type SaveResult,
} from "@/server/actions/settings/privacy";
import { Foot, Row, SettingsHead } from "./SettingsParts";
import s from "./settings.module.css";
import p from "./PrivacySettings.module.css";

type Props = { slug: string; companyName: string; data: PrivacyPageData };

const msg = (k: string) => `settingsPrivacy.${k}` as MessageKey;
const CONFIRM_KEY: Record<RetentionKind, string> = { assist_turns: "confirmAssist", idea_drafts: "confirmDrafts", closed_cases: "confirmCases" };

export function PrivacySettings({ slug, companyName, data }: Props) {
  const t = useT();
  const f = useFormat();
  const [saved, setSaved] = useState(data.rules);
  const [form, setForm] = useState<PrivacyForm>(() => fromRules(data.rules));
  const [errors, setErrors] = useState<Partial<Record<RetentionKind, FormErrorKey>>>({});
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: RetentionKind; n: number }[] | null>(null);
  const [shots, setShots] = useState(data.reportScreenshots);
  const [shotStatus, setShotStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [exports, setExports] = useState(data.exports);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const failure = (r: Extract<SaveResult, { ok: false }>) =>
    r.error === "forbidden" ? t("settingsPrivacy.errorForbidden") : r.error === "auditFailed" ? t("settingsPrivacy.errorAuditFailed") : t("settingsPrivacy.errorInvalid");

  function commit() {
    const input = toRuleInput(form);
    start(async () => {
      const r = await saveRetentionAction(slug, input);
      setConfirm(null);
      if (r.ok) {
        setSaved(input);
        setStatus({ text: t("settingsPrivacy.saved") });
      } else {
        if (r.fields) setErrors(r.fields);
        setStatus({ text: failure(r), error: true });
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const input = toRuleInput(form);
    const found = formErrors(input);
    setErrors(found);
    if (Object.keys(found).length) return setStatus({ text: t("settingsPrivacy.errorInvalid"), error: true });
    if (!needsConfirm(saved, input)) return commit();
    start(async () => {
      const kinds = shortened(saved, input);
      const counts = await Promise.all(kinds.map(async (kind) => ({ kind, n: (await previewRetention(slug, kind, input[kind])) ?? 0 })));
      setConfirm(counts);
    });
  }

  function toggleShots(on: boolean) {
    setShots(on);
    setShotStatus(null);
    start(async () => {
      const r = await saveScreenshotsAction(slug, on);
      if (r.ok) setShotStatus({ text: t("settingsPrivacy.saved") });
      else {
        setShots(!on);
        setShotStatus({ text: failure(r), error: true });
      }
    });
  }

  function exportCompany() {
    setExportStatus(null);
    start(async () => {
      const r = await requestExport(slug, { kind: "company", deliverTo: "admin" });
      if (!r.ok) setExportStatus(r.error || t("settingsPrivacy.errorExport"));
      const list = await listExportsAction(slug);
      if (list) setExports(list);
    });
  }

  const num = (kind: RetentionKind, tid: string, value: number, set: (n: number) => void, disabled = false) => (
    <input className={s.input} data-size="num" type="number" inputMode="numeric" value={Number.isNaN(value) ? "" : value} disabled={disabled}
      id={`privacy-${tid}`} aria-invalid={errors[kind] ? true : undefined} data-testid={`settings-privacy-rule-${tid}`}
      onChange={(e) => set(e.target.value === "" ? NaN : Number(e.target.value))} />
  );
  const err = (kind: RetentionKind) => (errors[kind] ? t(msg(errors[kind]!)) : undefined);
  const lr = data.lastRun;
  const removed = lr?.removed ?? {};
  const statusOf = (e: PrivacyPageData["exports"][number]) =>
    e.status === "ready" ? t("settingsPrivacy.statusReady") : e.status === "expired" ? t("settingsPrivacy.statusExpired")
      : e.status === "failed" ? t("settingsPrivacy.statusFailed") : t("settingsPrivacy.statusPreparing");

  return (
    <div className={s.page}>
      <SettingsHead title={t("settingsPrivacy.navLabel")} lede={t("settingsPrivacy.lede", { company: companyName })} />

      <div data-testid="settings-privacy-agreement">
      <SectionCard name="agreement" title={t("settingsPrivacy.cardAgreement")}>
        <dl className={p.facts}>
          <div className={p.fact}>
            <dt className={p.factLabel}>{t("settingsPrivacy.agreement")}</dt>
            <dd className={`${p.factValue} ${data.dpaSignedAt ? "" : p.warn}`}>
              {data.dpaSignedAt ? t("settingsPrivacy.agreementSigned", { date: f.date(data.dpaSignedAt, "day") }) : t("settingsPrivacy.agreementNone")}
            </dd>
          </div>
          <div className={p.fact}><dt className={p.factLabel}>{t("settingsPrivacy.where")}</dt><dd className={p.factValue}>{t("settingsPrivacy.whereValue")}</dd></div>
          <div className={p.fact}><dt className={p.factLabel}>{t("settingsPrivacy.personnel")}</dt><dd className={p.factValue}>{t("settingsPrivacy.personnelValue")}</dd></div>
        </dl>
      </SectionCard>
      </div>

      <form onSubmit={submit} noValidate>
        <SectionCard name="kept" title={t("settingsPrivacy.cardKept")}>
          <Row id="privacy-assist" label={t("settingsPrivacy.ruleAssist")} wide help={t("settingsPrivacy.ruleAssistHelp")} error={err("assist_turns")}>
            <div className={s.inline}>{num("assist_turns", "assist", form.assistDays, (n) => setForm({ ...form, assistDays: n }))}<span className={s.unit}>{t("settingsPrivacy.daysUnit")}</span></div>
          </Row>
          <Row id="privacy-drafts" label={t("settingsPrivacy.ruleDrafts")} wide help={t("settingsPrivacy.ruleDraftsHelp")} error={err("idea_drafts")}>
            <div className={s.inline}>{num("idea_drafts", "drafts", form.draftDays, (n) => setForm({ ...form, draftDays: n }))}<span className={s.unit}>{t("settingsPrivacy.daysUnit")}</span></div>
          </Row>
          <Row label={t("settingsPrivacy.ruleCases")} wide help={t("settingsPrivacy.ruleCasesHelp")} error={err("closed_cases")}>
            <div className={s.inline}>
              <span className={p.segment} role="radiogroup" aria-label={t("settingsPrivacy.ruleCases")}>
                {(["keep", "remove"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={form.closedCases === m} className={s.soft}
                    data-on={form.closedCases === m || undefined}
                    data-testid={`settings-privacy-cases-${m}`} onClick={() => setForm({ ...form, closedCases: m })}>
                    {t(m === "keep" ? "settingsPrivacy.caseKeep" : "settingsPrivacy.caseRemove")}
                  </button>
                ))}
              </span>
              {num("closed_cases", "cases", form.closedMonths, (n) => setForm({ ...form, closedMonths: n }), form.closedCases === "keep")}
              <span className={s.unit}>{t("settingsPrivacy.monthsUnit")}</span>
            </div>
          </Row>
          <Row label={t("settingsPrivacy.ruleAudit")} wide><span>{t("settingsPrivacy.ruleAuditValue")}</span></Row>
          <Foot status={status?.text} tone={status?.error ? "error" : undefined} statusTestId="settings-privacy-status">
            <p className={s.status} data-testid="settings-privacy-last-run">
              {lr?.at
                ? `${t("settingsPrivacy.lastRun", { date: f.date(lr.at, "dateTime") })} · ${t("settingsPrivacy.lastRunRemoved", { turns: f.number(removed.assistTurns ?? 0), drafts: f.number(removed.drafts ?? 0), cases: f.number(removed.cases ?? 0), outbox: f.number(removed.outbox ?? 0), teamsLinks: f.number(removed.teamsLinks ?? 0) })}`
                : t("settingsPrivacy.lastRunNone")}
            </p>
            <button className={s.save} type="submit" disabled={pending} data-testid="settings-privacy-save-rules">
              {pending ? t("settingsPrivacy.saving") : t("settingsPrivacy.save")}
            </button>
          </Foot>
        </SectionCard>
      </form>

      <SectionCard name="screenshots" title={t("settingsPrivacy.cardScreenshots")}>
        <label className={s.switch}>
          <input type="checkbox" role="switch" checked={shots} disabled={pending} onChange={(e) => toggleShots(e.target.checked)} data-testid="settings-privacy-screenshots" />
          {t("settingsPrivacy.screenshotsSwitch")}
        </label>
        <p className={s.help}>{t("settingsPrivacy.screenshotsHelp")}</p>
        {shotStatus ? <Foot status={shotStatus.text} tone={shotStatus.error ? "error" : undefined}>{null}</Foot> : null}
      </SectionCard>

      <SectionCard
        name="exports"
        title={t("settingsPrivacy.cardExports")}
        action={<button type="button" className={s.save} disabled={pending} onClick={exportCompany} data-testid="settings-privacy-export-company">{t("settingsPrivacy.exportCompany")}</button>}
      >
        {exportStatus ? <p className={s.fieldError} role="alert">{exportStatus}</p> : null}
        {exports.length === 0 ? (
          <p className={p.empty} data-testid="settings-privacy-exports-empty">{t("settingsPrivacy.exportsEmpty")}</p>
        ) : (
          <DataTable
            rows={exports}
            rowKey={(e) => e.id}
            empty={t("settingsPrivacy.exportsEmpty")}
            columns={[
              {
                key: "what", header: t("settingsPrivacy.colWhat"),
                render: (e) => (
                  <span data-testid="settings-privacy-exports-row">
                    {e.kind === "company" ? t("settingsPrivacy.whatCompany") : `${t("settingsPrivacy.whatPerson")} (${t(e.deliverTo === "person" ? "settingsPrivacy.toPerson" : "settingsPrivacy.toAdmin")})`}
                  </span>
                ),
              },
              {
                key: "by", header: t("settingsPrivacy.colRequested"),
                render: (e) => {
                  const name = data.names[e.requestedByUserId] ?? "";
                  return name ? <span className={p.person}><PersonFace name={name} size="sm" />{name}, {f.date(e.createdAt, "dayMonth")}</span> : f.date(e.createdAt, "dayMonth");
                },
              },
              {
                key: "status", header: t("settingsPrivacy.colStatus"),
                render: (e) => (
                  <>
                    {statusOf(e)}
                    {e.status === "failed" ? <span className={p.err}>{t("settingsPrivacy.failedLine")}</span> : null}
                    {e.downloadable ? (
                      <>{" "}<a className={s.soft} href={`/api/${slug}/exports/${e.id}`} data-testid="settings-privacy-download">{t("settingsPrivacy.download")}</a></>
                    ) : null}
                  </>
                ),
              },
              { key: "expires", header: t("settingsPrivacy.colExpires"), render: (e) => (e.status === "expired" || e.status === "failed" ? "–" : f.date(e.expiresAt, "dayMonth")) },
            ]}
          />
        )}
        <p className={s.help}>{t("settingsPrivacy.exportsHint")}</p>
      </SectionCard>

      {confirm ? (
        <div className={s.scrim}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-label={t("settingsPrivacy.confirmTitle")} data-testid="settings-privacy-confirm">
            <h2 className={s.cardTitle}>{t("settingsPrivacy.confirmTitle")}</h2>
            <p className={s.dialogText}>{t("settingsPrivacy.confirmIntro")}</p>
            <ul className={p.list}>
              {confirm.map((c) => <li key={c.kind}>{t(msg(CONFIRM_KEY[c.kind]), { n: f.number(c.n) })}</li>)}
            </ul>
            <p className={s.dialogText}>{t("settingsPrivacy.confirmUndo")}</p>
            <div className={s.dialogButtons}>
              <button type="button" className={s.soft} onClick={() => setConfirm(null)}>{t("settingsPrivacy.confirmNo")}</button>
              <button type="button" className={s.save} disabled={pending} onClick={commit} data-testid="settings-privacy-confirm-yes">{t("settingsPrivacy.confirmYes")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
