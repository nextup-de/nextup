"use client";
// The org editor: units as a tree, roles under their unit, seats under their role. Every button
// calls a server action from src/server/actions/settings/org.ts and shows the refusal's message.
import { useState, useTransition, type FormEvent } from "react";
import type { Knowledge, RoleRow, UnitRow } from "@/features/knowledge";
import { UNIT_KINDS } from "@/features/org-edit";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import {
  addRoleAction, addSeatAction, addUnitAction, linkSeatAction, removeRoleAction, removeSeatAction,
  removeUnitAction, updateRoleAction, updateUnitAction, type OrgResult,
} from "@/server/actions/settings/org";
import styles from "./OrgEditor.module.css";

export type MemberOption = { id: string; name: string };
type Props = { slug: string; knowledge: Knowledge; members: MemberOption[] };

const KIND_LABEL: Record<(typeof UNIT_KINDS)[number], MessageKey> = {
  board: "settingsOrg.unitKindBoard", dept: "settingsOrg.unitKindDept", team: "settingsOrg.unitKindTeam",
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const orNull = (s: string) => (s === "" ? null : s);
const whole = (s: string) => (s === "" ? 0 : Number(s));

/** Units in tree order with their depth. */
function unitTree(units: readonly UnitRow[]): { unit: UnitRow; depth: number }[] {
  const ids = new Set(units.map((u) => u.id));
  const out: { unit: UnitRow; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (u: UnitRow, depth: number) => {
    if (seen.has(u.id)) return;
    seen.add(u.id);
    out.push({ unit: u, depth });
    units.filter((c) => c.parentId === u.id).forEach((c) => walk(c, depth + 1));
  };
  units.filter((u) => !u.parentId || !ids.has(u.parentId)).forEach((u) => walk(u, 0));
  units.forEach((u) => walk(u, 0));
  return out;
}

export function OrgEditor({ slug, knowledge: k, members }: Props) {
  const t = useT();
  const [error, setError] = useState<MessageKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const run = (call: () => Promise<OrgResult>, after?: () => void) =>
    start(async () => {
      const r = await call();
      setError(r.ok ? null : r.error);
      setSaved(r.ok);
      if (r.ok) after?.();
    });
  const submit = (call: (f: FormData) => Promise<OrgResult>) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    run(() => call(new FormData(form)), () => form.reset());
  };

  const unitOptions = (
    <>
      <option value="">{t("settingsOrg.unitNoParent")}</option>
      {unitTree(k.units).map(({ unit, depth }) => <option key={unit.id} value={unit.id}>{"– ".repeat(depth) + unit.name}</option>)}
    </>
  );
  const bossOptions = (self: string | null) => (
    <>
      <option value="">{t("settingsOrg.roleNoBoss")}</option>
      {k.roles.filter((r) => r.id !== self).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
    </>
  );
  const roleInput = (f: FormData, orgUnitId: string) => ({
    orgUnitId, title: text(f, "title"), reportsToId: orNull(text(f, "reportsToId")),
    decides: text(f, "decides").split("\n"), spendLimitEur: text(f, "spend") === "" ? null : whole(text(f, "spend")),
  });

  const roleBlock = (role: RoleRow) => {
    const seats = k.holders.filter((h) => h.roleId === role.id);
    return (
      <li key={role.id} className={styles.role} data-testid={`settings-org-role-${role.id}`}>
        <form className={styles.fields} onSubmit={submit((f) => updateRoleAction(slug, role.id, roleInput(f, role.orgUnitId)))}>
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.roleTitle")}</span>
            <input className="nh-input" name="title" defaultValue={role.title} required /></label>
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.roleReportsTo")}</span>
            <select className="nh-select" name="reportsToId" defaultValue={role.reportsToId ?? ""}>{bossOptions(role.id)}</select></label>
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.roleSpend")}</span>
            <input className="nh-input" name="spend" type="number" min={0} defaultValue={role.spendLimitEur ?? ""} /></label>
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.roleDecides")}</span>
            <textarea className="nh-input" name="decides" rows={2} defaultValue={role.decides.join("\n")} /></label>
          <span className={styles.buttons}>
            <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" disabled={pending} data-testid="settings-org-role-save">{t("settingsOrg.save")}</button>
            <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-org-role-remove"
              onClick={() => run(() => removeRoleAction(slug, role.id))}>{t("settingsOrg.remove")}</button>
          </span>
        </form>
        <div className={styles.seats}>
          <strong className="nh-label">{t("settingsOrg.seatsTitle")}</strong>
          {seats.length === 0 ? <span className="nh-hint">{t("settingsOrg.seatNone")}</span> : null}
          {seats.map((s) => (
            <div key={s.id} className={styles.seat} data-testid={`settings-org-seat-${s.id}`}>
              <span>{s.name}</span>
              <select className="nh-select" aria-label={t("settingsOrg.seatMember")} value={s.userId ?? ""} disabled={pending}
                data-testid="settings-org-seat-link" onChange={(e) => run(() => linkSeatAction(slug, s.id, orNull(e.target.value)))}>
                <option value="">{t("settingsOrg.seatNoMember")}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending}
                onClick={() => run(() => removeSeatAction(slug, s.id))}>{t("settingsOrg.remove")}</button>
            </div>
          ))}
          <form className={styles.seat} onSubmit={submit((f) => {
            const userId = orNull(text(f, "userId"));
            const name = text(f, "name") || members.find((m) => m.id === userId)?.name || "";
            return addSeatAction(slug, role.id, name, userId);
          })}>
            <input className="nh-input" name="name" placeholder={t("settingsOrg.seatName")} aria-label={t("settingsOrg.seatName")} data-testid="settings-org-seat-name" />
            <select className="nh-select" name="userId" aria-label={t("settingsOrg.seatMember")} data-testid="settings-org-seat-member">
              <option value="">{t("settingsOrg.seatNoMember")}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" disabled={pending} data-testid="settings-org-seat-add">{t("settingsOrg.seatAdd")}</button>
          </form>
        </div>
      </li>
    );
  };

  return (
    <div className={styles.wrap} data-testid="settings-org">
      <p className="nh-hint">{t("settingsOrg.orgHint")}</p>
      {error ? <p className="nh-error" role="alert" data-testid="settings-org-error">{t(error)}</p> : null}
      {saved && !error ? <p className="nh-hint" role="status">{t("settingsOrg.saved")}</p> : null}

      <form className={styles.add} onSubmit={submit((f) => addUnitAction(slug, {
        key: text(f, "key").toUpperCase(), name: text(f, "name"), kind: text(f, "kind"), headcount: whole(text(f, "headcount")), parentId: orNull(text(f, "parentId")),
      }))}>
        <h2 className={styles.title}>{t("settingsOrg.unitsTitle")}</h2>
        <div className={styles.fields}>
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.unitKey")}</span>
            <input className="nh-input" name="key" required maxLength={32} data-testid="settings-org-unit-key" /></label>
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.unitName")}</span>
            <input className="nh-input" name="name" required data-testid="settings-org-unit-name" /></label>
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.unitKind")}</span>
            <select className="nh-select" name="kind" defaultValue="dept">{UNIT_KINDS.map((x) => <option key={x} value={x}>{t(KIND_LABEL[x])}</option>)}</select></label>
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.unitHeadcount")}</span>
            <input className="nh-input" name="headcount" type="number" min={0} defaultValue={0} /></label>
          <label className="nh-field"><span className="nh-label">{t("settingsOrg.unitParent")}</span>
            <select className="nh-select" name="parentId">{unitOptions}</select></label>
          <span className={styles.buttons}>
            <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-org-unit-add">{t("settingsOrg.unitAdd")}</button>
          </span>
        </div>
      </form>

      {k.units.length === 0 ? <p className="nh-hint">{t("settingsOrg.unitEmpty")}</p> : null}
      {unitTree(k.units).map(({ unit, depth }) => (
        <section key={unit.id} className={styles.unit} style={{ marginLeft: depth * 20 }} data-testid={`settings-org-unit-${unit.key}`}>
          <form className={styles.fields} onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => updateUnitAction(slug, unit.id, { name: text(f, "name"), kind: text(f, "kind"), headcount: whole(text(f, "headcount")), parentId: orNull(text(f, "parentId")) }));
          }}>
            <strong className={styles.key}>{unit.key}</strong>
            <input className="nh-input" name="name" defaultValue={unit.name} aria-label={t("settingsOrg.unitName")} required />
            <select className="nh-select" name="kind" defaultValue={unit.kind} aria-label={t("settingsOrg.unitKind")}>
              {UNIT_KINDS.map((x) => <option key={x} value={x}>{t(KIND_LABEL[x])}</option>)}</select>
            <input className="nh-input" name="headcount" type="number" min={0} defaultValue={unit.headcount} aria-label={t("settingsOrg.unitHeadcount")} />
            <select className="nh-select" name="parentId" defaultValue={unit.parentId ?? ""} aria-label={t("settingsOrg.unitParent")}>
              {unitOptions}</select>
            <span className={styles.buttons}>
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" disabled={pending}>{t("settingsOrg.save")}</button>
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-org-unit-remove"
                onClick={() => run(() => removeUnitAction(slug, unit.id))}>{t("settingsOrg.remove")}</button>
            </span>
          </form>

          <h3 className={styles.sub}>{t("settingsOrg.rolesTitle")}</h3>
          <ul className={styles.roles}>{k.roles.filter((r) => r.orgUnitId === unit.id).map(roleBlock)}</ul>
          <form className={styles.fields} onSubmit={submit((f) => addRoleAction(slug, roleInput(f, unit.id)))}>
            <label className="nh-field"><span className="nh-label">{t("settingsOrg.roleTitle")}</span>
              <input className="nh-input" name="title" required data-testid="settings-org-role-title" /></label>
            <label className="nh-field"><span className="nh-label">{t("settingsOrg.roleReportsTo")}</span>
              <select className="nh-select" name="reportsToId" data-testid="settings-org-role-reports">{bossOptions(null)}</select></label>
            <label className="nh-field"><span className="nh-label">{t("settingsOrg.roleSpend")}</span>
              <input className="nh-input" name="spend" type="number" min={0} /></label>
            <label className="nh-field"><span className="nh-label">{t("settingsOrg.roleDecides")}</span>
              <textarea className="nh-input" name="decides" rows={2} /></label>
            <span className={styles.buttons}>
              <button className="nh-btn nh-btn-primary nh-btn-sm" type="submit" disabled={pending} data-testid="settings-org-role-add">{t("settingsOrg.roleAdd")}</button>
            </span>
          </form>
        </section>
      ))}
    </div>
  );
}
