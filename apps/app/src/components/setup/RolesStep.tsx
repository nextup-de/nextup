"use client";
// Setup step 3: the roles and their seats. Reduced to title, unit, reports to and seats, as Paper has
// it; what a role decides and may spend stays on Settings -> Org. Same org actions as there.
import { useState, type FormEvent } from "react";
import type { Knowledge, RoleRow } from "@/features/knowledge";
import { unitTree } from "@/features/settings/org-view";
import { useT } from "@/i18n/client";
import { addRoleAction, addSeatAction, linkSeatAction, removeSeatAction, updateRoleAction, type OrgResult } from "@/server/actions/settings/org";
import type { MemberOption } from "@/components/settings/OrgEditor";
import settings from "@/components/settings/settings.module.css";
import { Added, AddedRow, Field, Refusal, StepCard, useRun, type StepFormProps } from "./parts";
import s from "./Setup.module.css";

type Props = StepFormProps & { knowledge: Knowledge; members: MemberOption[] };

/** A seat needs a name unique within its role: the person's, or the role's title and a number. */
function seatName(title: string, n: number, person: string | undefined): string {
  return person ?? (n === 0 ? title : `${title} ${n + 1}`);
}

export function RolesStep({ slug, formId, onDirty, demo, knowledge: k, members }: Props) {
  const t = useT();
  const { error, pending, run, clear } = useRun();
  const rows = unitTree(k.units);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [round, setRound] = useState(0); // a new round gives an empty form
  const [seats, setSeats] = useState<string[]>([""]); // a new role's seats: a member's id, or "" while vacant
  const finish = () => { setEditing(null); setSeats([""]); setRound((n) => n + 1); onDirty(false); };

  const unitLine = (role: RoleRow) => {
    const unit = k.units.find((u) => u.id === role.orgUnitId);
    const parent = k.units.find((u) => u.id === unit?.parentId);
    return [parent?.name, unit?.name].filter(Boolean).join(" · ");
  };
  const held = (id: string) => k.holders.filter((h) => h.roleId === id).sort((a, b) => a.sort - b.sort);
  const memberName = (id: string) => members.find((m) => m.id === id)?.name;
  const current = editing ? k.roles.find((r) => r.id === editing.id) ?? editing : null;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (name: string) => String(f.get(name) ?? "").trim();
    const boss = text("reportsToId");
    const role = { orgUnitId: text("orgUnitId"), title: text("title"), reportsToId: boss === "" ? null : boss };
    if (current) {
      const { id, decides, spendLimitEur } = current;
      run(() => updateRoleAction(slug, id, { ...role, decides, spendLimitEur }), finish);
      return;
    }
    run(async (): Promise<OrgResult> => {
      const made = await addRoleAction(slug, { ...role, decides: [], spendLimitEur: null });
      if (!made.ok || !made.id) return made;
      for (const [n, userId] of seats.entries()) {
        const seat = await addSeatAction(slug, made.id, seatName(role.title, n, memberName(userId)), userId === "" ? null : userId);
        if (!seat.ok) return seat;
      }
      return { ok: true };
    }, finish);
  };

  const options = (
    <>
      <option value="">{t("settingsOrg.linkMember")}</option>
      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </>
  );

  return (
    <StepCard title={t("settingsSetup.cardRoles")} text={t("settingsSetup.cardRolesText")}>
      {k.roles.length ? (
        <Added>
          {k.roles.map((role) => (
            <AddedRow key={role.id} name={role.title} sub={unitLine(role)} testId={`setup-role-${role.id}`}
              side={held(role.id).some((h) => !h.userId) || held(role.id).length === 0 ? <span className={s.badge}>{t("settingsOrg.vacant")}</span> : null}
              onEdit={() => { clear(); setEditing(role); setRound((n) => n + 1); }} />
          ))}
        </Added>
      ) : null}
      <h3 className={s.subLabel}>{current ? current.title : t("settingsSetup.addRoleTitle")}</h3>
      <form key={round} id={formId} className={s.form} onSubmit={submit} onInput={() => onDirty(true)}>
        <Field label={t("settingsOrg.roleTitle")}>
          <input className={settings.input} name="title" required defaultValue={current?.title ?? ""} data-testid="setup-role-title" />
        </Field>
        <div className={s.pair}>
          <Field label={t("settingsOrg.roleUnit")}>
            <select className={settings.input} name="orgUnitId" defaultValue={current?.orgUnitId ?? rows[0]?.unit.id} data-testid="setup-role-unit">
              {rows.map(({ unit, depth }) => <option key={unit.id} value={unit.id}>{"– ".repeat(depth) + unit.name}</option>)}
            </select>
          </Field>
          <Field label={t("settingsOrg.roleReportsTo")}>
            <select className={settings.input} name="reportsToId" defaultValue={current?.reportsToId ?? ""} data-testid="setup-role-reports">
              <option value="">{t("settingsOrg.roleNoBoss")}</option>
              {k.roles.filter((r) => r.id !== current?.id).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </Field>
        </div>
        <div className={s.field}>
          <span className={s.fieldLabel}>{t("settingsOrg.seats")}</span>
          {current ? (
            <ul className={s.seats}>
              {held(current.id).map((h) => (
                <li key={h.id} className={s.seat}>
                  {h.userId ? <span className={s.seatName}>{memberName(h.userId) ?? h.name}</span> : <span className={s.badge}>{t("settingsOrg.vacant")}</span>}
                  <select className={settings.input} aria-label={t("settingsOrg.seatMember")} value={h.userId ?? ""} disabled={pending || demo}
                    onChange={(e) => { const v = e.target.value; run(() => linkSeatAction(slug, h.id, v === "" ? null : v)); }}>{options}</select>
                  <button type="button" className={s.seatX} aria-label={t("settingsOrg.remove")} disabled={pending || demo} onClick={() => run(() => removeSeatAction(slug, h.id))}>×</button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={s.seats}>
              {seats.map((userId, n) => (
                <li key={n} className={s.seat}>
                  {userId ? <span className={s.seatName}>{memberName(userId)}</span> : <span className={s.badge}>{t("settingsOrg.vacant")}</span>}
                  <select className={settings.input} aria-label={t("settingsOrg.seatMember")} value={userId} data-testid="setup-seat-link"
                    onChange={(e) => { const v = e.target.value; setSeats(seats.map((x, i) => (i === n ? v : x))); }}>{options}</select>
                  {seats.length > 1 ? <button type="button" className={s.seatX} aria-label={t("settingsOrg.remove")} onClick={() => setSeats(seats.filter((_, i) => i !== n))}>×</button> : null}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={s.textBtn} disabled={pending || demo} data-testid="setup-seat-add"
            onClick={() => {
              if (!current) { setSeats([...seats, ""]); return; }
              const { id, title } = current;
              const names = new Set(held(id).map((h) => h.name));
              let n = held(id).length;
              while (names.has(seatName(title, n, undefined))) n += 1;
              run(() => addSeatAction(slug, id, seatName(title, n, undefined), null));
            }}>+ {t("settingsOrg.addSeat")}</button>
        </div>
        <Refusal error={error} />
        <div className={s.formFoot}>
          <span className={s.fieldHelp}>{demo ? t("settingsCompany.demoData") : t("settingsSetup.seatsVacantHelp")}</span>
          <span className={s.formButtons}>
            {current ? <button type="button" className={s.secondary} onClick={finish}>{t("settingsOrg.cancel")}</button> : null}
            <button type="submit" className={s.secondary} disabled={pending || demo} data-testid="setup-role-add">
              {current ? t("settingsOrg.save") : t("settingsOrg.roleAdd")}
            </button>
          </span>
        </div>
      </form>
    </StepCard>
  );
}
