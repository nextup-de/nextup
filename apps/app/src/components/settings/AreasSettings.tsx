"use client";
// Settings -> Areas: the list of shop-floor areas, a drawer to add or edit one, and links to the QR poster and
// the devices page. Every change calls an action from server/actions/settings/areas.ts. No counts (FLR D2).
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { Banner, DataTable, DeptChip, EditDrawer, SectionCard, type Column } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { removeAreaAction, saveAreaAction, setAreaOnAction, type AreaResult } from "@/server/actions/settings/areas";
import { SettingsHead } from "./SettingsParts";
import s from "./settings.module.css";
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
  const columns: Column<AreaView>[] = [
    {
      key: "area", header: t("settingsAreas.colName"), width: "minmax(0, 2fr)",
      render: (a) => (
        <div className={styles.area} data-testid={`settings-areas-row-${a.key}`}>
          <span className={styles.areaText}>
            <strong data-testid="settings-areas-name">{a.name}</strong>
            <span className={styles.key} data-testid="settings-areas-key">{a.key}</span>
          </span>
          <Link className={s.soft} href={`${prefix}/settings/areas/${a.key}/poster`} data-testid="settings-areas-poster">{t("settingsAreas.posterLink")}</Link>
        </div>
      ),
    },
    { key: "unit", header: t("settingsAreas.colUnit"), render: (a) => <DeptChip name={a.unitName} /> },
    { key: "role", header: t("settingsAreas.colRole"), render: (a) => a.roleTitle },
    {
      key: "raise", header: t("settingsAreas.colRaise"),
      render: (a) => (
        <span className={styles.areaText}>
          {t(a.anonymous ? "settingsAreas.raiseAnonymous" : "settingsAreas.raiseCode")}
          <span className={styles.status} data-on={a.on ? "" : undefined}>{t(a.on ? "settingsAreas.on" : "settingsAreas.off")}</span>
        </span>
      ),
    },
    {
      key: "actions", header: "", width: "220px",
      render: (a) => (
        <span className={styles.buttons}>
          {confirming === a.id ? (
            <>
              <button className={s.ghostDanger} type="button" disabled={pending} data-testid="settings-areas-delete-yes"
                onClick={() => run(() => removeAreaAction(slug, a.id), () => setConfirming(null))}>{t("settingsAreas.removeYes")}</button>
              <button className={s.soft} type="button" onClick={() => setConfirming(null)}>{t("settingsAreas.cancel")}</button>
            </>
          ) : (
            <>
              <button className={s.soft} type="button" disabled={pending} data-testid="settings-areas-toggle"
                onClick={() => run(() => setAreaOnAction(slug, a.id, !a.on))}>{t(a.on ? "settingsAreas.pause" : "settingsAreas.resume")}</button>
              <button className={s.soft} type="button" disabled={pending} data-testid="settings-areas-edit" onClick={() => show(a)}>{t("settingsAreas.edit")}</button>
              <button className={s.ghostDanger} type="button" disabled={pending} data-testid="settings-areas-delete" onClick={() => setConfirming(a.id)}>{t("settingsAreas.remove")}</button>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <section className={s.page} data-testid="settings-areas">
      <div className={s.headRow}>
        <SettingsHead title={t("settingsAreas.title")} lede={t("settingsAreas.hint")} />
        <span className={styles.buttons}>
          <Link className={s.soft} href={`${prefix}/settings/areas/devices`} data-testid="settings-areas-devices-link">{t("settingsAreas.devices")}</Link>
          <button className={s.save} type="button" data-testid="settings-areas-add" onClick={() => show("new")}>{t("settingsAreas.add")}</button>
        </span>
      </div>
      {error && !open ? <div data-testid="settings-areas-error"><Banner tone="error">{t(error)}</Banner></div> : null}
      {saved && !error ? <div role="status" data-testid="settings-areas-saved"><Banner tone="info">{t("settingsAreas.saved")}</Banner></div> : null}

      {confirming ? <div role="alert"><Banner tone="warn">{t("settingsAreas.removeConfirm")}</Banner></div> : null}

      <SectionCard>
        {areas.length === 0 ? (
          <p className={s.empty} data-testid="settings-areas-empty">{t("settingsAreas.empty")}</p>
        ) : (
          <DataTable columns={columns} rows={areas} rowKey={(a) => a.id} empty={t("settingsAreas.empty")} />
        )}
      </SectionCard>

      {open ? (
        <EditDrawer
          title={t(editing ? "settingsAreas.drawerEdit" : "settingsAreas.drawerAdd")}
          closeLabel={t("settingsAreas.close")}
          onClose={() => setOpen(null)}
          testId="settings-areas-drawer"
          foot={
            <>
              <button className={s.soft} type="button" onClick={() => setOpen(null)} data-testid="settings-areas-cancel">{t("settingsAreas.cancel")}</button>
              <button className={s.save} type="submit" form="settings-areas-form" disabled={pending} data-testid="settings-areas-save">{t("settingsAreas.save")}</button>
            </>
          }
        >
          <form id="settings-areas-form" key={editing?.id ?? "new"} className={styles.form} onSubmit={submit}>
            <label className={s.field}><span className={s.label}>{t("settingsAreas.fieldName")}</span>
              <input className={s.input} name="name" required maxLength={60} defaultValue={editing?.name ?? ""} data-testid="settings-areas-field-name" /></label>
            <label className={s.field}><span className={s.label}>{t("settingsAreas.fieldKey")}</span>
              <input className={s.input} name="key" required maxLength={32} defaultValue={editing?.key ?? ""} data-testid="settings-areas-field-key" />
              <span className={s.help}>{t("settingsAreas.fieldKeyHint")}</span></label>
            <label className={s.field}><span className={s.label}>{t("settingsAreas.fieldUnit")}</span>
              <select className={s.input} name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)} data-testid="settings-areas-field-unit">
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></label>
            <label className={s.field}><span className={s.label}>{t("settingsAreas.fieldRole")}</span>
              <select className={s.input} name="roleId" key={unitId} defaultValue={editing && editing.unitId === unitId ? editing.roleId : (unitRoles[0]?.id ?? "")} data-testid="settings-areas-field-role">
                {unitRoles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select></label>
            <label className={styles.check}><input type="checkbox" name="anonymous" defaultChecked={editing?.anonymous ?? false} data-testid="settings-areas-field-anonymous" /> {t("settingsAreas.fieldAnonymous")}</label>
            {error ? <p className={s.fieldError} role="alert" data-testid="settings-areas-error">{t(error)}</p> : null}
          </form>
        </EditDrawer>
      ) : null}
    </section>
  );
}
