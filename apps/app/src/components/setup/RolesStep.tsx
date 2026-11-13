"use client";
// Setup step 3: the roles and their seats. Reduced to title, unit, reports to and seats, as Paper has
// it; what a role decides and may spend stays on Settings -> Org. Same org actions as there.
import { useState, type FormEvent } from "react";
import type { Knowledge, RoleRow } from "@/features/knowledge";
import { unitTree } from "@/features/settings/org-view";
import { useT } from "@/i18n/client";
import { addRoleWithSeatsAction, addSeatAction, linkSeatAction, removeSeatAction, updateRoleAction } from "@/server/actions/settings/org";
import type { MemberOption } from "@/components/settings/OrgEditor";
import settings from "@/components/settings/settings.module.css";
import { AddButton, Added, AddedRow, Field, Refusal, StepCard, StepDrawer, useRun, type StepFormProps } from "./parts";
import s from "./Setup.module.css";

type Props = StepFormProps & { knowledge: Knowledge; members: MemberOption[] };

/** A seat needs a name unique within its role: the person's, or the role's title and a number. */
function seatName(title: string, n: number, person: string | undefined): string {
  return person ?? (n === 0 ? title : `${title} ${n + 1}`);
}

export function RolesStep({ slug, formId, demo, knowledge: k, members }: Props) {
  const t = useT();
  const { error, pending, run, clear } = useRun();
  const rows = unitTree(k.units);
  // The drawer: closed, open for a new role, or open on one role. Closing it drops what was typed.
  const [drawer, setDrawer] = useState<{ editing: RoleRow | null } | null>(null);
  const editing = drawer?.editing ?? null;
  const [seats, setSeats] = useState<string[]>([""]); // a new role's seats: a member's id, or "" while vacant
  const show = (role: RoleRow | null) => { clear(); setSeats([""]); setDrawer({ editing: role }); };
  const finish = () => setDrawer(null);

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
    const newSeats = seats.map((userId, n) => ({ name: seatName(role.title, n, memberName(userId)), userId: userId === "" ? null : userId }));
    run(() => addRoleWithSeatsAction(slug, { ...role, decides: [], spendLimitEur: null }, newSeats), finish);
  };

  const options = (
    <>
      <option value="">{t("settingsOrg.linkMember")}</option>
      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </>
  );

  return (
    <>
      <StepCard title={t("settingsSetup.cardRoles")} text={t("settingsSetup.cardRolesText")}
        action={<AddButton label={t("settingsOrg.roleAdd")} onClick={() => show(null)} testId="setup-role-new" />}>
        {k.roles.length ? (
          <Added>
            {k.roles.map((role) => (
              <AddedRow key={role.id} name={role.title} sub={unitLine(role)} testId={`setup-role-${role.id}`}
                side={held(role.id).some((h) => !h.userId) || held(role.id).length === 0 ? <span className={s.badge}>{t("settingsOrg.vacant")}</span> : null}
                onEdit={() => show(role)} />
            ))}
          </Added>
        ) : null}
      </StepCard>
      {drawer ? (
        <StepDrawer title={current ? current.title : t("settingsSetup.addRoleTitle")} formId={formId} onClose={finish}
          submitLabel={current ? t("settingsOrg.save") : t("settingsOrg.roleAdd")} disabled={pending || !!demo} testId="setup-role-drawer" submitTestId="setup-role-add">
          <form id={formId} className={s.form} onSubmit={submit}>
            <Field label={t("settingsOrg.roleTitle")}>
              <input className={settings.input} name="title" required autoFocus defaultValue={current?.title ?? ""} data-testid="setup-role-title" />
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
            <p className={s.fieldHelp}>{demo ? t("settingsCompany.demoData") : t("settingsSetup.seatsVacantHelp")}</p>
          </form>
        </StepDrawer>
      ) : null}
    </>
  );
}
