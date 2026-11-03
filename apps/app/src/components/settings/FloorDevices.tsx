"use client";
// /settings/areas/devices: shared devices and floor codes (FLR-D1). A code is shown once in the box at the top.
import { useState, useTransition } from "react";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import {
  createDeviceAction, issueFloorCodeAction, newPairCodeAction, removeDeviceAction,
} from "@/server/actions/settings/floor-devices";
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
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const run = (work: () => Promise<Outcome>) =>
    start(async () => {
      setError(null);
      const r = await work();
      if (!r.ok) setError(r.error);
    });

  return (
    <>
      {error ? <p className="nh-error" role="alert" data-testid="floor-devices-error">{t(error)}</p> : null}
      {secret ? (
        <div className={styles.secret} role="status" data-testid="floor-devices-secret">
          <strong>{t("floorDevices.shownOnceTitle")}</strong>
          <p className="nh-hint">{t("floorDevices.shownOnceHint")}</p>
          <p>{secret.kind === "pair" ? t("floorDevices.pairCodeIs", { label: secret.label }) : t("floorDevices.floorCodeIs", { name: secret.label })}</p>
          <p className={styles.code} data-testid="floor-devices-secret-code">{secret.code}</p>
          {secret.kind === "pair" ? <p className="nh-hint">{t("floorDevices.pairCodeUntil", { path: `/${slug}/floor/pair` })}</p> : null}
          <button className="nh-btn" type="button" onClick={() => setSecret(null)} data-testid="floor-devices-secret-done">
            {t("floorDevices.dismiss")}
          </button>
        </div>
      ) : null}

      <section className={styles.section} data-testid="floor-devices-list">
        <h2>{t("floorDevices.devicesTitle")}</h2>
        {devices.length === 0 ? <p>{t("floorDevices.devicesNone")}</p> : (
          <ul className={styles.list}>
            {devices.map((d) => (
              <li key={d.id} className={styles.row} data-testid={`floor-device-${d.id}`}>
                <div className={styles.meta}>
                  <strong>{d.label}</strong>
                  <span className="nh-hint">{d.areaNames.length === 0 ? t("floorDevices.allAreas") : d.areaNames.join(", ")}</span>
                  <span className="nh-hint">{d.pairedAt ? t("floorDevices.pairedAt", { date: format.date(d.pairedAt, "dateTime") }) : t("floorDevices.notPaired")}</span>
                  <span className="nh-hint">{d.lastUsedAt ? t("floorDevices.lastUsed", { date: format.date(d.lastUsedAt, "dateTime") }) : t("floorDevices.neverUsed")}</span>
                </div>
                <div className={styles.actions}>
                  <button className="nh-btn" type="button" disabled={pending} onClick={() => run(async () => {
                    const r = await newPairCodeAction(slug, d.id);
                    if (!r.ok) return r;
                    setSecret({ kind: "pair", label: d.label, code: r.pairCode });
                    return { ok: true };
                  })}>{t("floorDevices.newPairCode")}</button>
                  <button className="nh-btn nh-btn-ghost" type="button" disabled={pending} onClick={() => {
                    if (window.confirm(t("floorDevices.removeAsk"))) run(() => removeDeviceAction(slug, d.id));
                  }}>{t("floorDevices.remove")}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          className={styles.create}
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await createDeviceAction(slug, { label, areaIds: picked });
              if (!r.ok) return r;
              setSecret({ kind: "pair", label: r.label, code: r.pairCode });
              setLabel("");
              setPicked([]);
              return { ok: true };
            });
          }}
        >
          <label className="nh-label" htmlFor="floor-device-label">{t("floorDevices.deviceLabel")}</label>
          <input id="floor-device-label" className="nh-input" value={label} maxLength={60} placeholder={t("floorDevices.deviceLabelHint")} onChange={(e) => setLabel(e.target.value)} data-testid="floor-device-label" />
          <fieldset className={styles.areas}>
            <legend className="nh-label">{t("floorDevices.deviceAreas")}</legend>
            {areas.map((a) => (
              <label key={a.id}>
                <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, a.id] : picked.filter((x) => x !== a.id))} /> {a.name}
              </label>
            ))}
            <span className="nh-hint">{t("floorDevices.allAreas")}</span>
          </fieldset>
          <button className="nh-btn nh-btn-primary" type="submit" disabled={pending || label.trim() === ""} data-testid="floor-device-create">
            {t("floorDevices.create")}
          </button>
        </form>
      </section>

      <section className={styles.section} data-testid="floor-devices-members">
        <h2>{t("floorDevices.membersTitle")}</h2>
        <p className="nh-hint">{t("floorDevices.membersHint")}</p>
        {members.length === 0 ? <p>{t("floorDevices.membersNone")}</p> : (
          <ul className={styles.list}>
            {members.map((m) => (
              <li key={m.id} className={styles.row} data-testid={`floor-member-${m.id}`}>
                <span>{m.name}</span>
                <button className="nh-btn" type="button" disabled={pending} onClick={() => run(async () => {
                  const r = await issueFloorCodeAction(slug, m.id);
                  if (!r.ok) return r;
                  setSecret({ kind: "floor", label: m.name, code: r.code });
                  return { ok: true };
                })}>{t("floorDevices.newFloorCode")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
