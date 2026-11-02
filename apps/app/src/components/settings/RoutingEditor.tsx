"use client";
// The routing table, editable: request type, keywords, owner / deputy / buddy role, wait, order.
import { useState, useTransition, type FormEvent } from "react";
import { holdersOfRole, type Knowledge, type RoleRow, type RuleRow } from "@/features/knowledge";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { moveRouteAction, removeRouteAction, saveRouteAction, type OrgResult } from "@/server/actions/settings/org";
import styles from "./RoutingEditor.module.css";

type Props = { slug: string; knowledge: Knowledge };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const orNull = (s: string) => (s === "" ? null : s);

export function RoutingEditor({ slug, knowledge: k }: Props) {
  const t = useT();
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const roleLabel = (r: RoleRow) => `${r.title} (${unitName.get(r.orgUnitId) ?? "?"})`;

  const run = (call: () => Promise<OrgResult>, after?: () => void) =>
    start(async () => {
      const r = await call();
      setError(r.ok ? null : r.error);
      if (r.ok) after?.();
    });

  const roleSelect = (name: string, label: MessageKey, value: string | null, testid: string, required = false) => (
    <label className="nh-field">
      <span className="nh-label">{t(label)}</span>
      <select className="nh-select" name={name} defaultValue={value ?? ""} data-testid={testid}>
        {required ? <option value="" /> : <option value="">{t("settingsOrg.routeNone")}</option>}
        {k.roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r)}</option>)}
      </select>
    </label>
  );

  const form = (rule: RuleRow | null) => {
    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      const f = new FormData(el);
      run(() => saveRouteAction(slug, {
        key: rule ? rule.key : text(f, "key"), type: text(f, "type"),
        keywords: text(f, "keywords").split(","), ownerRoleId: orNull(text(f, "owner")),
        deputyRoleId: orNull(text(f, "deputy")), buddyRoleId: orNull(text(f, "buddy")), wait: text(f, "wait"),
      }), () => { if (!rule) el.reset(); });
    };
    return (
      <form className={styles.fields} onSubmit={onSubmit} data-testid={rule ? `settings-routing-row-${rule.key}` : "settings-routing-new"}>
        {rule ? <strong className={styles.key}>{rule.key} · {rule.type} · {holdersOfRole(k, rule.ownerRoleId)[0]?.name ?? ""}</strong> : (
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.routeKey")}</span>
            <input className="nh-input" name="key" required maxLength={32} data-testid="settings-routing-key" /></label>
        )}
        <label className="nh-field"><span className="nh-label">{t("settingsOrg.routeType")}</span>
          <input className="nh-input" name="type" defaultValue={rule?.type ?? ""} required data-testid="settings-routing-type" /></label>
        <label className="nh-field"><span className="nh-label">{t("settingsOrg.routeKeywords")}</span>
          <input className="nh-input" name="keywords" defaultValue={rule?.keywords.join(", ") ?? ""} required data-testid="settings-routing-keywords" /></label>
        {roleSelect("owner", "settingsOrg.routeOwner", rule?.ownerRoleId ?? null, "settings-routing-owner", true)}
        {roleSelect("deputy", "settingsOrg.routeDeputy", rule?.deputyRoleId ?? null, "settings-routing-deputy")}
        {roleSelect("buddy", "settingsOrg.routeBuddy", rule?.buddyRoleId ?? null, "settings-routing-buddy")}
        <label className="nh-field"><span className="nh-label">{t("settingsOrg.routeWait")}</span>
          <input className="nh-input" name="wait" defaultValue={rule?.wait ?? ""} data-testid="settings-routing-wait" /></label>
        <span className={styles.buttons}>
          <button className="nh-btn nh-btn-primary nh-btn-sm" type="submit" disabled={pending} data-testid={rule ? `settings-routing-save-${rule.key}` : "settings-routing-add"}>
            {rule ? t("settingsOrg.save") : t("settingsOrg.routeAdd")}
          </button>
          {rule ? (
            <>
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid={`settings-routing-up-${rule.key}`}
                onClick={() => run(() => moveRouteAction(slug, rule.id, "up"))}>{t("settingsOrg.moveUp")}</button>
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid={`settings-routing-down-${rule.key}`}
                onClick={() => run(() => moveRouteAction(slug, rule.id, "down"))}>{t("settingsOrg.moveDown")}</button>
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid={`settings-routing-remove-${rule.key}`}
                onClick={() => run(() => removeRouteAction(slug, rule.id))}>{t("settingsOrg.remove")}</button>
            </>
          ) : null}
        </span>
      </form>
    );
  };

  const rules = [...k.rules].sort((a, b) => a.sort - b.sort);
  return (
    <div className={styles.wrap} data-testid="settings-routing">
      <p className="nh-hint">{t("settingsOrg.routingHint")}</p>
      {error ? <p className="nh-error" role="alert" data-testid="settings-routing-error">{t(error)}</p> : null}
      {rules.length === 0 ? <p className="nh-hint">{t("settingsOrg.routeEmpty")}</p> : null}
      {rules.map((r) => <div key={`${r.id}:${r.sort}`} className={styles.row}>{form(r)}</div>)}
      <div className={styles.row}>{form(null)}</div>
    </div>
  );
}
