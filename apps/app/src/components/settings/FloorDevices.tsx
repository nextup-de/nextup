"use client";
// /settings/areas/devices: shared devices and floor codes (FLR-D1). A code is shown once in the box at the top.
import { useState, useTransition } from "react";
import { Banner, ConfirmDialog, DataTable, EditDrawer, PersonFace, SecretOnce, SectionCard, type Column } from "@/components/ui/elements";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import {
  createDeviceAction, issueFloorCodeAction, newPairCodeAction, removeDeviceAction,
} from "@/server/actions/settings/floor-devices";
import { SettingsHead } from "./SettingsParts";
import s from "./settings.module.css";
import styles from "./FloorDevices.module.css";

export type DeviceView = { id: string; label: string; areaNames: string[]; pairedAt: string | null; lastUsedAt: string | null };
export type MemberView = { id: string; name: string };
export type AreaView = { id: string; name: string };
export type FloorDevicesProps = { slug: string; devices: DeviceView[]; members: MemberView[]; areas: AreaView[] };

type Secret = { kind: "pair" | "floor"; label: string; code: string };
type Outcome = { ok: true } | { ok: false; error: MessageKey };

export function FloorDevices({ slug, devices, members, areas }: FloorDevicesProps) {
  const t = useT();
  const format = useFormat();
  const [secret, setSecret] = useState<Secret | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<DeviceView | null>(null);
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const run = (work: () => Promise<Outcome>) =>
    start(async () => {
      setError(null);
      const r = await work();
      if (!r.ok) setError(r.error);
    });

  const closeAdd = () => { setAdding(false); setLabel(""); setPicked([]); };

  const deviceColumns: Column<DeviceView>[] = [
    {
      key: "device", header: t("floorDevices.colDevice"), width: "minmax(0, 1.4fr)",
      render: (d) => <strong data-testid={`floor-device-${d.id}`}>{d.label}</strong>,
    },
    { key: "areas", header: t("floorDevices.colAreas"), render: (d) => (d.areaNames.length === 0 ? t("floorDevices.allAreas") : d.areaNames.join(", ")) },
    { key: "paired", header: t("floorDevices.colPaired"), render: (d) => (d.pairedAt ? t("floorDevices.pairedAt", { date: format.date(d.pairedAt, "dateTime") }) : t("floorDevices.notPaired")) },
    { key: "used", header: t("floorDevices.colLastUsed"), render: (d) => (d.lastUsedAt ? t("floorDevices.lastUsed", { date: format.date(d.lastUsedAt, "dateTime") }) : t("floorDevices.neverUsed")) },
    {
      key: "actions", header: "", width: "230px",
      render: (d) => (
        <span className={styles.buttons}>
          <button className={s.soft} type="button" disabled={pending} onClick={() => run(async () => {
            const r = await newPairCodeAction(slug, d.id);
            if (!r.ok) return r;
            setSecret({ kind: "pair", label: d.label, code: r.pairCode });
            return { ok: true };
          })}>{t("floorDevices.newPairCode")}</button>
          <button className={s.ghostDanger} type="button" disabled={pending} onClick={() => setRemoving(d)}>{t("floorDevices.remove")}</button>
        </span>
      ),
    },
  ];

  const memberColumns: Column<MemberView>[] = [
    {
      key: "person", header: t("floorDevices.colPerson"),
      render: (m) => (
        <span className={styles.person} data-testid={`floor-member-${m.id}`}>
          <PersonFace name={m.name} size="sm" />
          {m.name}
        </span>
      ),
    },
    {
      key: "actions", header: "", width: "160px",
      render: (m) => (
        <button className={s.soft} type="button" disabled={pending} onClick={() => run(async () => {
          const r = await issueFloorCodeAction(slug, m.id);
          if (!r.ok) return r;
          setSecret({ kind: "floor", label: m.name, code: r.code });
          return { ok: true };
        })}>{t("floorDevices.newFloorCode")}</button>
      ),
    },
  ];

  return (
    <div className={s.page}>
      <div className={s.headRow}>
        <SettingsHead title={t("floorDevices.title")} lede={t("floorDevices.hint")} />
        <button className={s.save} type="button" data-testid="floor-device-add" onClick={() => setAdding(true)}>{t("floorDevices.addDevice")}</button>
      </div>
      {error ? <div data-testid="floor-devices-error"><Banner tone="error">{t(error)}</Banner></div> : null}
      {secret ? (
        <div role="status" data-testid="floor-devices-secret">
          <SectionCard title={t("floorDevices.shownOnceTitle")} hint={secret.kind === "pair" ? t("floorDevices.pairCodeIs", { label: secret.label }) : t("floorDevices.floorCodeIs", { name: secret.label })}>
            <SecretOnce value={secret.code} note={t("floorDevices.shownOnceHint")} copyLabel={t("floorDevices.copy")} copiedLabel={t("floorDevices.copied")} testId="floor-devices-secret-code" />
            {secret.kind === "pair" ? <p className={s.cardHint}>{t("floorDevices.pairCodeUntil", { path: `/${slug}/floor/pair` })}</p> : null}
            <div>
              <button className={s.save} type="button" onClick={() => setSecret(null)} data-testid="floor-devices-secret-done">{t("floorDevices.dismiss")}</button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      <div data-testid="floor-devices-list">
        <SectionCard title={t("floorDevices.devicesTitle")}>
          {devices.length === 0 ? <p className={s.empty}>{t("floorDevices.devicesNone")}</p> : (
            <DataTable columns={deviceColumns} rows={devices} rowKey={(d) => d.id} empty={t("floorDevices.devicesNone")} />
          )}
        </SectionCard>
      </div>

      <div data-testid="floor-devices-members">
        <SectionCard title={t("floorDevices.membersTitle")} hint={t("floorDevices.membersHint")}>
          {members.length === 0 ? <p className={s.empty}>{t("floorDevices.membersNone")}</p> : (
            <DataTable columns={memberColumns} rows={members} rowKey={(m) => m.id} empty={t("floorDevices.membersNone")} />
          )}
        </SectionCard>
      </div>

      {adding ? (
        <EditDrawer
          title={t("floorDevices.addDevice")}
          closeLabel={t("floorDevices.close")}
          onClose={closeAdd}
          testId="floor-device-drawer"
          foot={
            <>
              <button className={s.soft} type="button" onClick={closeAdd}>{t("floorDevices.cancel")}</button>
              <button className={s.save} type="submit" form="floor-device-form" disabled={pending || label.trim() === ""} data-testid="floor-device-create">
                {t("floorDevices.create")}
              </button>
            </>
          }
        >
          <form
            id="floor-device-form"
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await createDeviceAction(slug, { label, areaIds: picked });
                if (!r.ok) return r;
                setSecret({ kind: "pair", label: r.label, code: r.pairCode });
                closeAdd();
                return { ok: true };
              });
            }}
          >
            <div className={s.field}>
              <label className={s.label} htmlFor="floor-device-label">{t("floorDevices.deviceLabel")}</label>
              <input id="floor-device-label" className={s.input} value={label} maxLength={60} placeholder={t("floorDevices.deviceLabelHint")} onChange={(e) => setLabel(e.target.value)} data-testid="floor-device-label" autoFocus />
            </div>
            <fieldset className={styles.areas}>
              <legend className={s.label}>{t("floorDevices.deviceAreas")}</legend>
              {areas.map((a) => (
                <label key={a.id} className={styles.check}>
                  <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, a.id] : picked.filter((x) => x !== a.id))} /> {a.name}
                </label>
              ))}
              <span className={s.help}>{t("floorDevices.allAreas")}</span>
            </fieldset>
            {error ? <p className={s.fieldError} role="alert">{t(error)}</p> : null}
          </form>
        </EditDrawer>
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={t("floorDevices.remove")}
          text={t("floorDevices.removeAsk")}
          confirmLabel={t("floorDevices.remove")}
          cancelLabel={t("floorDevices.cancel")}
          danger
          testId="floor-device-remove-dialog"
          onCancel={() => setRemoving(null)}
          onConfirm={() => { const d = removing; setRemoving(null); run(() => removeDeviceAction(slug, d.id)); }}
        />
      ) : null}
    </div>
  );
}
