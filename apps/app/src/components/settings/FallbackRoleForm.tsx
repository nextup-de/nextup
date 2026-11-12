"use client";
// Settings -> Rules: the fallback desk role (plan GAT, Q1.9, D16): who takes a raise whose route has nobody. Its own small form next to RulesForm,
// saved by saveFallbackRoleAction. While the company review is on the review role takes those raises, so the select shows 'Review role' and is off.
import { useActionState } from "react";
import { useT } from "@/i18n/client";
import { saveFallbackRoleAction } from "@/server/actions/settings/approvals";
import type { SettingsFormState } from "@/server/actions/settings/company";
import type { RoleOption } from "./ApprovalsSettings";
import { Card, Foot, Row } from "./SettingsParts";
import s from "./settings.module.css";

type Props = { slug: string; roleId: string | null; reviewOn: boolean; roles: RoleOption[]; demo?: boolean };

export function FallbackRoleForm({ slug, roleId, reviewOn, roles, demo }: Props) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveFallbackRoleAction, {});
  const error = state.error ? t(state.error) : undefined;
  const status = error ?? (state.ok ? t("approvals.saved") : demo ? t("approvals.demoOff") : undefined);
  return (
    <form action={act} className={s.page} data-testid="settings-fallback-form">
      <input type="hidden" name="slug" value={slug} />
      <Card title={t("approvals.fallbackRole")}>
        <Row id="fallbackRole" label={t("approvals.fallbackRole")} wide help={t("approvals.fallbackHint")} error={state.field === "fallbackRole" ? error : undefined}>
          {reviewOn ? (
            <select className={s.input} id="fallbackRole" disabled data-testid="settings-fallback-role"><option>{t("approvals.reviewRole")}</option></select>
          ) : (
            <select className={s.input} id="fallbackRole" name="fallbackRole" defaultValue={roleId ?? ""} data-testid="settings-fallback-role">
              <option value="">{t("settingsOrg.routeNone")}</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          )}
        </Row>
        <Foot status={status} tone={error ? "error" : undefined} statusTestId={error ? "settings-fallback-error" : state.ok ? "settings-fallback-saved" : undefined}>
          <button className={s.save} type="submit" disabled={pending || demo || reviewOn} data-testid="settings-fallback-save">{pending ? t("settingsCompany.saving") : t("settingsCompany.save")}</button>
        </Foot>
      </Card>
    </form>
  );
}
