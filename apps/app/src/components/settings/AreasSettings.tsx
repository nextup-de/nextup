"use client";
// Settings -> Areas: the list of shop-floor areas, a drawer to add or edit one, and links to the QR poster and
// the devices page. Every change calls an action from server/actions/settings/areas.ts. No counts (FLR D2).
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { removeAreaAction, saveAreaAction, setAreaOnAction, type AreaResult } from "@/server/actions/settings/areas";
import styles from "./AreasSettings.module.css";

export type AreaView = { id: string; key: string; name: string; unitId: string; unitName: string; roleId: string; roleTitle: string; anonymous: boolean; on: boolean };
type Props = {
  slug: string;
  /** Link prefix of the company, e.g. `/acme`. */
  prefix: string;
  areas: AreaView[];
  units: { id: string; name: string }[];
  roles: { id: string; title: string; orgUnitId: string }[];
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export function AreasSettings({ slug, prefix, areas, units, roles }: Props) {
  const t = useT();
  const [open, setOpen] = useState<AreaView | "new" | null>(null);
  const [unitId, setUnitId] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const run = (call: () => Promise<AreaResult>, after?: () => void) =>
    start(async () => {
      const r = await call();
      setError(r.ok ? null : r.error);
      setSaved(r.ok);
      if (r.ok) after?.();
    });

  const show = (a: AreaView | "new") => {
    setError(null);
    setSaved(false);
    setUnitId(a === "new" ? (units[0]?.id ?? "") : a.unitId);
    setOpen(a);
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const editing = open && open !== "new" ? open : null;
    const input = {
      ...(editing ? { id: editing.id } : {}),
      key: text(f, "key"), name: text(f, "name"), unitId: text(f, "unitId"), roleId: text(f, "roleId"),
      anonymous: f.get("anonymous") === "on", on: editing ? editing.on : true,
    };
    run(() => saveAreaAction(slug, input), () => setOpen(null));
  };

  const editing = open && open !== "new" ? open : null;
  const unitRoles = roles.filter((r) => r.orgUnitId === unitId);
  return (
    <section className={styles.wrap} data-testid="settings-areas">
      <div className={styles.head}>
        <p className="nh-hint">{t("settingsAreas.hint")}</p>
        <span className={styles.buttons}>
          <Link className="nh-btn nh-btn-ghost nh-btn-sm" href={`${prefix}/settings/areas/devices`} data-testid="settings-areas-devices-link">{t("settingsAreas.devices")}</Link>
          <button className="nh-btn nh-btn-primary nh-btn-sm" type="button" data-testid="settings-areas-add" onClick={() => show("new")}>{t("settingsAreas.add")}</button>
        </span>
      </div>
      {error && !open ? <p className="nh-error" role="alert" data-testid="settings-areas-error">{t(error)}</p> : null}
      {saved && !error ? <p className="nh-hint" role="status" data-testid="settings-areas-saved">{t("settingsAreas.saved")}</p> : null}
      {areas.length === 0 ? <p className="nh-hint" data-testid="settings-areas-empty">{t("settingsAreas.empty")}</p> : null}

      <ul className={styles.list}>
        {areas.map((a) => (
          <li key={a.id} className={styles.row} data-testid={`settings-areas-row-${a.key}`}>
            <div className={styles.rowHead}>
              <span>
                <strong data-testid="settings-areas-name">{a.name}</strong>
                <span className={styles.key} data-testid="settings-areas-key"> {a.key}</span>
              </span>
              <span className={styles.buttons}>
                <Link className="nh-btn nh-btn-ghost nh-btn-sm" href={`${prefix}/settings/areas/${a.key}/poster`} data-testid="settings-areas-poster">{t("settingsAreas.poster")}</Link>
                <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-areas-toggle"
                  onClick={() => run(() => setAreaOnAction(slug, a.id, !a.on))}>{t(a.on ? "settingsAreas.pause" : "settingsAreas.resume")}</button>
                <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-areas-edit" onClick={() => show(a)}>{t("settingsAreas.edit")}</button>
                {confirming === a.id ? (
                  <>
                    <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-areas-delete-yes"
                      onClick={() => run(() => removeAreaAction(slug, a.id), () => setConfirming(null))}>{t("settingsAreas.removeYes")}</button>
                    <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setConfirming(null)}>{t("settingsAreas.cancel")}</button>
                  </>
                ) : (
                  <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-areas-delete" onClick={() => setConfirming(a.id)}>{t("settingsAreas.remove")}</button>
                )}
              </span>
            </div>
            <span className="nh-hint">
              {[a.unitName, a.roleTitle, t(a.anonymous ? "settingsAreas.raiseAnonymous" : "settingsAreas.raiseCode"), t(a.on ? "settingsAreas.on" : "settingsAreas.off")].join(" · ")}
            </span>
            {confirming === a.id ? <span className="nh-hint" role="alert">{t("settingsAreas.removeConfirm")}</span> : null}
          </li>
        ))}
      </ul>

      {open ? (
        <form key={editing?.id ?? "new"} className={styles.drawer} role="dialog" aria-label={t(editing ? "settingsAreas.drawerEdit" : "settingsAreas.drawerAdd")}
          onSubmit={submit} data-testid="settings-areas-drawer">
          <h3 className={styles.title}>{t(editing ? "settingsAreas.drawerEdit" : "settingsAreas.drawerAdd")}</h3>
          <label className="nh-field"><span className="nh-label">{t("settingsAreas.fieldName")}</span>
            <input className="nh-input" name="name" required maxLength={60} defaultValue={editing?.name ?? ""} data-testid="settings-areas-field-name" /></label>
          <label className="nh-field"><span className="nh-label">{t("settingsAreas.fieldKey")}</span>
            <input className="nh-input" name="key" required maxLength={32} defaultValue={editing?.key ?? ""} data-testid="settings-areas-field-key" />
            <span className="nh-hint">{t("settingsAreas.fieldKeyHint")}</span></label>
          <label className="nh-field"><span className="nh-label">{t("settingsAreas.fieldUnit")}</span>
            <select className="nh-select" name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)} data-testid="settings-areas-field-unit">
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></label>
          <label className="nh-field"><span className="nh-label">{t("settingsAreas.fieldRole")}</span>
            <select className="nh-select" name="roleId" key={unitId} defaultValue={editing && editing.unitId === unitId ? editing.roleId : (unitRoles[0]?.id ?? "")} data-testid="settings-areas-field-role">
              {unitRoles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select></label>
          <label className="nh-field"><input type="checkbox" name="anonymous" defaultChecked={editing?.anonymous ?? false} data-testid="settings-areas-field-anonymous" /> {t("settingsAreas.fieldAnonymous")}</label>
          {error ? <p className="nh-error" role="alert" data-testid="settings-areas-error">{t(error)}</p> : null}
          <span className={styles.buttons}>
            <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-areas-save">{t("settingsAreas.save")}</button>
            <button className="nh-btn nh-btn-ghost" type="button" onClick={() => setOpen(null)} data-testid="settings-areas-cancel">{t("settingsAreas.cancel")}</button>
          </span>
        </form>
      ) : null}
    </section>
  );
}
