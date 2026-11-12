"use client";
// Settings -> Approvals (plan GAT, D27): who looks at a new idea first (the review), who must approve a yes (the rules) and the councils.
// One form in three cards; any Save sends all of it. Props in, JSX out: the page loads the config, the roles and the calendar.
import { useActionState, useState } from "react";
import type { ApprovalConfig } from "@/features/approvals/types";
import { useFormat, useT } from "@/i18n/client";
import { saveApprovalsAction } from "@/server/actions/settings/approvals";
import type { SettingsFormState } from "@/server/actions/settings/company";
import { Card, DemoNote, Foot, Row, SettingsHead } from "./SettingsParts";
import a from "./ApprovalsSettings.module.css";
import s from "./settings.module.css";

export type RoleOption = { id: string; label: string };
/** A council as the page shows it: `firstDate` is its first meeting as an ISO date, `nextDate` the next meeting on or after today (null for a new one). */
export type CouncilView = ApprovalConfig["councils"][number] & { firstDate: string; nextDate: string | null };
type Props = { slug: string; config: ApprovalConfig; roles: RoleOption[]; routes: { key: string; type: string }[]; councils: CouncilView[]; demo?: boolean };

type RuleRow = { key: number; id: string; approver: string; route: string; minEur: string };
type CouncilRow = { key: number; id: string; name: string; members: string[]; secretary: string; every: string; first: string; next: string | null };

export function ApprovalsSettings({ slug, config, roles, routes, councils, demo }: Props) {
  const t = useT();
  const fmt = useFormat();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveApprovalsAction, {});
  // Row keys: the stored rows take their place in the list, a row added in the browser takes the next number from `seq`.
  const [seq, setSeq] = useState(1000);
  const [on, setOn] = useState(config.review.on);
  const [rules, setRules] = useState<RuleRow[]>(() =>
    config.rules.map((r, key) => ({ key, id: r.id, approver: r.kind === "council" ? `council:${r.councilId ?? ""}` : `role:${r.roleId ?? ""}`, route: r.routeKey ?? "", minEur: r.minEur === null ? "" : String(r.minEur) })));
  const [rows, setRows] = useState<CouncilRow[]>(() =>
    councils.map((c, key) => ({ key, id: c.id, name: c.name, members: c.memberRoleIds, secretary: c.secretaryRoleId, every: String(c.everyDays), first: c.firstDate, next: c.nextDate })));

  const err = (field: string) => (state.field === field && state.error ? t(state.error) : undefined);
  const formError = state.error && !state.field ? t(state.error) : undefined;
  const status = formError ?? (state.ok ? t("approvals.saved") : demo ? t("approvals.demoOff") : undefined);
  const patchRule = (key: number, p: Partial<RuleRow>) => setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const patchCouncil = (key: number, p: Partial<CouncilRow>) => setRows((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));
  const roleOptions = (empty: string) => (
    <>
      <option value="">{empty}</option>
      {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
    </>
  );
  const foot = (last?: boolean) => (
    <Foot status={last ? status : undefined} tone={formError ? "error" : undefined} statusTestId={last ? (formError ? "settings-approvals-error" : state.ok ? "settings-approvals-saved" : undefined) : undefined}>
      <button className={s.save} type="submit" disabled={pending || demo} data-testid={last ? "settings-approvals-save" : undefined}>{pending ? t("settingsCompany.saving") : t("settingsCompany.save")}</button>
    </Foot>
  );
  const unit = t("settingsCompany.workingDaysUnit");

  return (
    <form action={act} className={s.page} data-testid="settings-approvals-form">
      <input type="hidden" name="slug" value={slug} />
      <SettingsHead title={t("approvals.navApprovals")} lede={t("approvals.approvalsLede")} />
      {demo ? <DemoNote text={t("settingsCompany.demoData")} /> : null}

      <Card title={t("approvals.routeReview")}>
        <label className={s.switch}>
          <input type="checkbox" role="switch" name="reviewOn" value="on" checked={on} onChange={(e) => setOn(e.target.checked)} data-testid="settings-approvals-review-on" />
          {t("approvals.reviewOn")}
        </label>
        <Row id="reviewRole" label={t("approvals.reviewRole")} wide error={err("reviewRole")}>
          <select className={s.input} id="reviewRole" name="reviewRole" defaultValue={config.review.roleId ?? ""} aria-invalid={Boolean(err("reviewRole")) || undefined} data-testid="settings-approvals-review-role">{roleOptions(t("settingsOrg.pickRole"))}</select>
        </Row>
        <Row id="reviewDays" label={t("approvals.reviewDays")} wide error={err("reviewDays")}>
          <div className={s.inline}><input className={s.input} data-size="num" id="reviewDays" name="reviewDays" type="number" inputMode="numeric" min={1} max={4} defaultValue={config.review.days} aria-invalid={Boolean(err("reviewDays")) || undefined} data-testid="settings-approvals-review-days" /><span className={s.unit}>{unit}</span></div>
        </Row>
        <Row id="reviewDeputy" label={t("approvals.reviewDeputy")} wide error={err("reviewDeputy")}>
          <select className={s.input} id="reviewDeputy" name="reviewDeputy" defaultValue={config.review.deputyRoleId ?? ""} aria-invalid={Boolean(err("reviewDeputy")) || undefined} data-testid="settings-approvals-review-deputy">{roleOptions(t("settingsOrg.routeNone"))}</select>
        </Row>
        {foot()}
      </Card>

      <Card title={t("approvals.navApprovals")}>
        <Row id="approvalDays" label={t("approvals.approvalDays")} wide error={err("approvalDays")}>
          <div className={s.inline}><input className={s.input} data-size="num" id="approvalDays" name="approvalDays" type="number" inputMode="numeric" min={1} max={30} defaultValue={config.approvalDays} aria-invalid={Boolean(err("approvalDays")) || undefined} data-testid="settings-approvals-days" /><span className={s.unit}>{unit}</span></div>
        </Row>
        <h3 className={s.label}>{t("approvals.rules")}</h3>
        {rules.length === 0 ? <p className={a.empty}>–</p> : null}
        <ul className={a.list} data-testid="settings-approvals-rules">
          {rules.map((r, i) => (
            <li key={r.key} className={a.item} data-testid={`settings-approvals-rule-${i}`}>
              <input type="hidden" name={`rule.${i}.id`} value={r.id} />
              <label className={a.field}>
                <span className={a.fieldLabel}>{t("approvals.ruleKind")}</span>
                <select className={s.input} name={`rule.${i}.approver`} value={r.approver} onChange={(e) => patchRule(r.key, { approver: e.target.value })} aria-invalid={Boolean(err(`rule.${i}.approver`)) || undefined}>
                  <option value="">{t("settingsOrg.pickRole")}</option>
                  {roles.map((x) => <option key={x.id} value={`role:${x.id}`}>{t("approvals.stepRole", { role: x.label })}</option>)}
                  {rows.map((c) => <option key={c.key} value={`council:${c.id}`}>{t("approvals.stepCouncil", { name: c.name || "…" })}</option>)}
                </select>
                {err(`rule.${i}.approver`) ? <span className={s.fieldError} role="alert">{err(`rule.${i}.approver`)}</span> : null}
              </label>
              <label className={a.field}>
                <span className={a.fieldLabel}>{t("approvals.ruleRoute")}</span>
                <select className={s.input} name={`rule.${i}.route`} value={r.route} onChange={(e) => patchRule(r.key, { route: e.target.value })}>
                  <option value="">{t("settingsOrg.routeNone")}</option>
                  {routes.map((x) => <option key={x.key} value={x.key}>{x.type}</option>)}
                </select>
              </label>
              <label className={a.field}>
                <span className={a.fieldLabel}>{t("approvals.ruleMinEur")}</span>
                <input className={s.input} name={`rule.${i}.minEur`} type="number" inputMode="numeric" min={0} value={r.minEur} onChange={(e) => patchRule(r.key, { minEur: e.target.value })} aria-invalid={Boolean(err(`rule.${i}.minEur`)) || undefined} />
                {err(`rule.${i}.minEur`) ? <span className={s.fieldError} role="alert">{err(`rule.${i}.minEur`)}</span> : null}
              </label>
              <button type="button" className={s.ghostDanger} onClick={() => setRules((rs) => rs.filter((x) => x.key !== r.key))}>{t("settingsCompany.remove")}</button>
            </li>
          ))}
        </ul>
        <button type="button" className={`${s.soft} ${a.add}`} onClick={() => { setRules((rs) => [...rs, { key: seq, id: "", approver: "", route: "", minEur: "" }]); setSeq(seq + 1); }} data-testid="settings-approvals-add-rule">{t("settingsCompany.add")}</button>
        {foot()}
      </Card>

      <Card title={t("approvals.councils")}>
        {rows.length === 0 ? <p className={a.empty}>–</p> : null}
        <ul className={a.list} data-testid="settings-approvals-councils">
          {rows.map((c, i) => (
            <li key={c.key} className={a.item} data-testid={`settings-approvals-council-${i}`}>
              <input type="hidden" name={`council.${i}.id`} value={c.id} />
              <label className={a.field}>
                <span className={a.fieldLabel}>{t("approvals.councilName")}</span>
                <input className={s.input} name={`council.${i}.name`} maxLength={120} value={c.name} onChange={(e) => patchCouncil(c.key, { name: e.target.value })} aria-invalid={Boolean(err(`council.${i}.name`)) || undefined} />
                {err(`council.${i}.name`) ? <span className={s.fieldError} role="alert">{err(`council.${i}.name`)}</span> : null}
              </label>
              <label className={a.field}>
                <span className={a.fieldLabel}>{t("approvals.councilSecretary")}</span>
                <select className={s.input} name={`council.${i}.secretary`} value={c.secretary} onChange={(e) => patchCouncil(c.key, { secretary: e.target.value })} aria-invalid={Boolean(err(`council.${i}.secretary`)) || undefined}>{roleOptions(t("settingsOrg.pickRole"))}</select>
                {err(`council.${i}.secretary`) ? <span className={s.fieldError} role="alert">{err(`council.${i}.secretary`)}</span> : null}
              </label>
              <label className={a.field}>
                <span className={a.fieldLabel}>{t("approvals.councilEvery", { days: c.every || "…" })}</span>
                <input className={s.input} name={`council.${i}.every`} type="number" inputMode="numeric" min={5} max={60} value={c.every} onChange={(e) => patchCouncil(c.key, { every: e.target.value })} aria-invalid={Boolean(err(`council.${i}.every`)) || undefined} />
                {err(`council.${i}.every`) ? <span className={s.fieldError} role="alert">{err(`council.${i}.every`)}</span> : null}
              </label>
              <label className={a.field}>
                <span className={a.fieldLabel}>{t("approvals.councilFirst")}</span>
                <input className={s.input} name={`council.${i}.first`} type="date" value={c.first} onChange={(e) => patchCouncil(c.key, { first: e.target.value })} aria-invalid={Boolean(err(`council.${i}.first`)) || undefined} />
                {err(`council.${i}.first`) ? <span className={s.fieldError} role="alert">{err(`council.${i}.first`)}</span> : null}
              </label>
              <label className={`${a.field} ${a.wide}`}>
                <span className={a.fieldLabel}>{t("approvals.councilMembers")}</span>
                <select className={`${s.input} ${a.members}`} name={`council.${i}.members`} multiple value={c.members} onChange={(e) => patchCouncil(c.key, { members: [...e.target.selectedOptions].map((o) => o.value) })}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
              <div className={a.itemFoot}>
                <span className={a.meeting}>{c.next ? t("approvals.nextMeeting", { date: fmt.date(`${c.next}T12:00:00Z`, "day") }) : ""}</span>
                <button type="button" className={s.ghostDanger} onClick={() => setRows((cs) => cs.filter((x) => x.key !== c.key))}>{t("settingsCompany.remove")}</button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className={`${s.soft} ${a.add}`} onClick={() => { setRows((cs) => [...cs, { key: seq, id: `new-${seq}`, name: "", members: [], secretary: "", every: "10", first: "", next: null }]); setSeq(seq + 1); }} data-testid="settings-approvals-add-council">{t("settingsCompany.add")}</button>
        {foot(true)}
      </Card>
    </form>
  );
}
