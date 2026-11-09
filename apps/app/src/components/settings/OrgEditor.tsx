"use client";
// The org editor: the unit tree on the left, the picked unit and its roles on the right. Drawers add
// or edit a unit or a role; a role's seats are linked to members in its drawer. Every change calls a
// server action from src/server/actions/settings/org.ts and shows the refusal's message.
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import type { Knowledge, RoleRow, UnitRow } from "@/features/knowledge";
import { UNIT_KINDS } from "@/features/org-edit";
import { orgSummary, unitTree, unitsWithVacancy, visibleRows } from "@/features/settings/org-view";
import { shortName } from "@/features/settings/routing-view";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import {
  addRoleAction, addSeatAction, addUnitAction, linkSeatAction, removeRoleAction, removeSeatAction,
  removeUnitAction, updateRoleAction, updateUnitAction, type OrgResult,
} from "@/server/actions/settings/org";
import { DeptChip, PersonFace } from "@/components/ui/elements";
import { SettingsHead } from "./SettingsParts";
import s from "./settings.module.css";
import o from "./OrgEditor.module.css";

export type MemberOption = { id: string; name: string };
/** `people`: unit id -> active people, sub-units included (features/settings/org-view peoplePerUnit). Without it, the stored head count. */
type Props = { slug: string; knowledge: Knowledge; members: MemberOption[]; demo?: boolean; showHead?: boolean; people?: Record<string, number> };

const KIND_LABEL: Record<(typeof UNIT_KINDS)[number], MessageKey> = {
  board: "settingsOrg.unitKindBoard", dept: "settingsOrg.unitKindDept", team: "settingsOrg.unitKindTeam",
};
const kindLabel = (kind: string): MessageKey => KIND_LABEL[kind as (typeof UNIT_KINDS)[number]] ?? "settingsOrg.unitKindDept";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const orNull = (v: string) => (v === "" ? null : v);
const whole = (v: string) => (v === "" ? 0 : Number(v));

/** Words as chips, sent one per line under `name`. */
function ChipField({ name, initial, label }: { name: string; initial: string[]; label: string }) {
  const t = useT();
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState<string | null>(null);
  const add = () => {
    const v = (draft ?? "").trim();
    if (v && !items.includes(v)) setItems([...items, v]);
    setDraft(null);
  };
  return (
    <div className={s.chips}>
      <input type="hidden" name={name} value={items.join("\n")} />
      {items.map((x) => (
        <span key={x} className={s.chip}>
          {x}
          <button type="button" className={s.chipX} aria-label={t("settingsCompany.removeItem", { name: x })} onClick={() => setItems(items.filter((y) => y !== x))}>×</button>
        </span>
      ))}
      {draft === null ? (
        <button type="button" className={s.dashed} aria-label={label} onClick={() => setDraft("")}>+</button>
      ) : (
        <input className={`${s.input} ${s.chipInput}`} autoFocus value={draft} aria-label={label}
          onChange={(e) => setDraft(e.target.value)} onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
            if (e.key === "Escape") setDraft(null);
          }} />
      )}
    </div>
  );
}

export function OrgEditor({ slug, knowledge: k, members, demo, showHead = true, people }: Props) {
  const t = useT();
  const fmt = useFormat();
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const rows = unitTree(k.units);
  const [picked, setPicked] = useState<string | null>(rows[0]?.unit.key ?? null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(rows.filter((r) => r.depth < 2).map((r) => r.unit.id)));
  const [query, setQuery] = useState("");
  const [unitDrawer, setUnitDrawer] = useState<UnitRow | "new" | null>(null);
  const [roleDrawer, setRoleDrawer] = useState<RoleRow | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "unit"; unit: UnitRow } | { kind: "role"; role: RoleRow } | null>(null);

  const unit = k.units.find((u) => u.key === picked) ?? null;
  const parentOf = (u: UnitRow) => k.units.find((p) => p.id === u.parentId) ?? null;
  const vacancy = unitsWithVacancy(k);
  const peopleOf = (u: UnitRow) => people?.[u.id] ?? u.headcount;
  const sum = orgSummary(k);
  const roleTitle = (id: string | null) => k.roles.find((r) => r.id === id)?.title ?? null;
  const seatsOf = (roleId: string) => k.holders.filter((h) => h.roleId === roleId).sort((a, b) => a.sort - b.sort);
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;

  const run = (call: () => Promise<OrgResult>, after?: () => void) =>
    start(async () => {
      const r = await call();
      setError(r.ok ? null : r.error);
      if (r.ok) after?.();
    });
  const openUnit = (u: UnitRow | "new") => { setError(null); setUnitDrawer(u); };
  const openRole = (r: RoleRow | "new") => { setError(null); setRoleDrawer(r); };
  const toggle = (id: string) => setOpen((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const saveUnit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const patch = { name: text(f, "name"), kind: text(f, "kind"), headcount: whole(text(f, "headcount")), parentId: orNull(text(f, "parentId")) };
    if (unitDrawer === "new") {
      const key = text(f, "key").toUpperCase();
      run(() => addUnitAction(slug, { key, ...patch }), () => {
        setUnitDrawer(null);
        setPicked(key);
        if (patch.parentId) setOpen((cur) => new Set(cur).add(patch.parentId as string));
      });
    } else if (unitDrawer) {
      const id = unitDrawer.id;
      run(() => updateUnitAction(slug, id, patch), () => setUnitDrawer(null));
    }
  };

  const saveRole = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      orgUnitId: text(f, "orgUnitId"), title: text(f, "title"), reportsToId: orNull(text(f, "reportsToId")),
      decides: text(f, "decides").split("\n").filter(Boolean), spendLimitEur: text(f, "spend") === "" ? null : whole(text(f, "spend")),
    };
    if (roleDrawer === "new") run(() => addRoleAction(slug, input), () => setRoleDrawer(null));
    else if (roleDrawer) { const id = roleDrawer.id; run(() => updateRoleAction(slug, id, input), () => setRoleDrawer(null)); }
  };

  const unitOptions = (self: string | null) => (
    <>
      <option value="">{t("settingsOrg.unitNoParent")}</option>
      {rows.filter((r) => r.unit.id !== self).map(({ unit: u, depth }) => <option key={u.id} value={u.id}>{"– ".repeat(depth) + u.name}</option>)}
    </>
  );
  const bossOptions = (self: string | null) => (
    <>
      <option value="">{t("settingsOrg.roleNoBoss")}</option>
      {k.roles.filter((r) => r.id !== self).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
    </>
  );
  const errorLine = error ? <p className={s.fieldError} role="alert" data-testid="settings-org-error">{t(error)}</p> : null;
  const roleEdit = roleDrawer && roleDrawer !== "new" ? k.roles.find((r) => r.id === roleDrawer.id) ?? roleDrawer : null;
  const unitEdit = unitDrawer && unitDrawer !== "new" ? unitDrawer : null;

  return (
    <div className={s.page} data-testid="settings-org">
      <div className={s.headRow}>
        {showHead ? <SettingsHead title={t("settingsOrg.navLabel")} lede={t("settingsOrg.orgSummary", { units: String(sum.units), roles: String(sum.roles), vacant: String(sum.vacantSeats) })} /> : <span />}
        <span className={o.headButtons}>
          <button type="button" className={s.soft} onClick={() => openUnit("new")} data-testid="settings-org-open-unit">{t("settingsOrg.unitAdd")}</button>
          {k.units.length ? <button type="button" className={s.save} onClick={() => openRole("new")} data-testid="settings-org-open-role">{t("settingsOrg.roleAdd")}</button> : null}
        </span>
      </div>
      {demo ? <p className={s.cardHint} data-testid="settings-demo-note">{t("settingsCompany.demoData")}</p> : null}
      {!unitDrawer && !roleDrawer ? errorLine : null}

      {k.units.length === 0 ? (
        <section className={`${s.card} ${o.empty}`}>
          <h2 className={s.cardTitle}>{t("settingsOrg.noUnitsTitle")}</h2>
          <p className={s.cardHint}>{t("settingsOrg.noUnitsText")}</p>
          <button type="button" className={s.save} onClick={() => openUnit("new")}>{t("settingsOrg.unitAdd")}</button>
        </section>
      ) : (
        <div className={o.split}>
          <section className={`${s.card} ${o.tree}`}>
            <h2 className={s.cardTitle}>{t("settingsOrg.unitsTitle")}</h2>
            <input className={s.input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("settingsOrg.searchUnits")} aria-label={t("settingsOrg.searchUnits")} />
            <ul className={o.treeList}>
              {visibleRows(rows, k.units, open, query).map(({ unit: u, depth, hasChildren }) => (
                <li key={u.id} className={o.treeRow} style={{ ["--depth" as string]: depth }} aria-current={u.key === picked ? "true" : undefined}>
                  {hasChildren ? (
                    <button type="button" className={o.twisty} data-open={open.has(u.id) || query ? "" : undefined} aria-label={t("settingsOrg.toggleUnit", { name: u.name })} aria-expanded={open.has(u.id)} onClick={() => toggle(u.id)}>▸</button>
                  ) : <span className={o.twisty} />}
                  <button type="button" className={o.treeName} data-top={depth === 0 ? "" : undefined} onClick={() => setPicked(u.key)} data-testid={`settings-org-unit-${u.key}`}><DeptChip name={u.name} /></button>
                  <span className={o.people} title={t("settingsOrg.unitPeople", { n: fmt.number(peopleOf(u)) })} data-testid={`settings-org-people-${u.key}`}>{fmt.number(peopleOf(u))}</span>
                  {vacancy.has(u.id) ? <span className={o.dot} title={t("settingsOrg.vacantSeats")} aria-label={t("settingsOrg.vacantSeats")} /> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className={`${s.card} ${o.detail}`}>
            {unit ? (
              <>
                <div className={s.cardHead}>
                  <div className={s.cardTitleBox}>
                    <h2 className={o.unitTitle}>{[parentOf(unit)?.name, unit.name].filter(Boolean).join(" · ")}</h2>
                    <p className={s.cardHint}>
                      {[t(kindLabel(unit.kind)), parentOf(unit) ? t("settingsOrg.unitIn", { parent: parentOf(unit)?.name ?? "" }) : null, t("settingsOrg.unitPeople", { n: fmt.number(peopleOf(unit)) })].filter(Boolean).join(" · ")} · <span className={s.mono}>{unit.key}</span>
                    </p>
                  </div>
                  <button type="button" className={s.soft} onClick={() => openUnit(unit)} data-testid="settings-org-unit-edit">{t("settingsOrg.editUnit")}</button>
                </div>
                <h3 className={s.subLabel}>{t("settingsOrg.rolesTitle")}</h3>
                {k.roles.filter((r) => r.orgUnitId === unit.id).length === 0 ? (
                  <div className={o.noRoles}>
                    <strong>{t("settingsOrg.noRolesTitle")}</strong>
                    <span className={s.cardHint}>{t("settingsOrg.noRolesText")}</span>
                  </div>
                ) : (
                  <ul className={o.roles}>
                    {k.roles.filter((r) => r.orgUnitId === unit.id).sort((a, b) => a.sort - b.sort).map((role) => {
                      const seats = seatsOf(role.id);
                      return (
                        <li key={role.id} className={o.role} data-testid={`settings-org-role-${role.id}`}>
                          <div className={o.roleHead}>
                            <strong>{role.title}</strong>
                            <button type="button" className={o.textBtn} onClick={() => openRole(role)} data-testid="settings-org-role-edit">{t("settingsOrg.edit")}</button>
                          </div>
                          <dl className={o.facts}>
                            {role.reportsToId ? <><dt>{t("settingsOrg.roleReportsTo")}</dt><dd>{roleTitle(role.reportsToId)}</dd></> : null}
                            {role.decides.length ? <><dt>{t("settingsOrg.decides")}</dt><dd>{role.decides.join(" · ")}</dd></> : null}
                            {role.spendLimitEur !== null ? <><dt>{t("settingsOrg.spendLimit")}</dt><dd>{fmt.euro(role.spendLimitEur)}</dd></> : null}
                            <dt>{t("settingsOrg.seats")}</dt>
                            <dd className={o.seatChips}>
                              {seats.filter((h) => h.userId).map((h) => (
                                <span key={h.id} className={o.person}><PersonFace name={memberName(h.userId) ?? h.name} size="sm" />{shortName(memberName(h.userId) ?? h.name)}</span>
                              ))}
                              {seats.some((h) => !h.userId) || seats.length === 0 ? <span className={s.vacant}>{t("settingsOrg.vacant")}</span> : null}
                              {seats.some((h) => !h.userId) || seats.length === 0 ? <span className={o.vacantNote}>{t("settingsOrg.vacantNote")}</span> : null}
                            </dd>
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className={o.addHere}>
                  <button type="button" className={s.soft} onClick={() => openRole("new")}>{t("settingsOrg.addRoleHere")}</button>
                </div>
              </>
            ) : <p className={s.cardHint}>{t("settingsOrg.pickUnit")}</p>}
          </section>
        </div>
      )}

      {unitDrawer ? (
        <div className={s.scrim} onClick={() => setUnitDrawer(null)}>
          <form key={unitEdit?.id ?? "new"} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="unit-drawer-title" onClick={(e) => e.stopPropagation()} onSubmit={saveUnit} data-testid="settings-org-unit-drawer">
            <div className={s.drawerHead}>
              <h2 id="unit-drawer-title" className={s.drawerTitle}>{unitEdit ? t("settingsOrg.editUnit") : t("settingsOrg.newUnit")}</h2>
              <button type="button" className={s.close} aria-label={t("settingsOrg.close")} onClick={() => setUnitDrawer(null)}>×</button>
            </div>
            <div className={s.drawerBody}>
              <div className={o.pair}>
                {unitEdit ? null : (
                  <label className={s.field}><span className={s.label}>{t("settingsOrg.unitKey")}</span>
                    <input className={s.input} name="key" required maxLength={32} autoFocus data-testid="settings-org-unit-key" /></label>
                )}
                <label className={s.field}><span className={s.label}>{t("settingsOrg.unitName")}</span>
                  <input className={s.input} name="name" required defaultValue={unitEdit?.name ?? ""} data-testid="settings-org-unit-name" /></label>
              </div>
              <div className={o.pair}>
                <label className={s.field}><span className={s.label}>{t("settingsOrg.unitKind")}</span>
                  <select className={s.input} name="kind" defaultValue={unitEdit?.kind ?? "dept"}>{UNIT_KINDS.map((x) => <option key={x} value={x}>{t(KIND_LABEL[x])}</option>)}</select></label>
                <label className={s.field}><span className={s.label}>{t("settingsOrg.parentUnit")}</span>
                  <select className={s.input} name="parentId" defaultValue={unitEdit ? unitEdit.parentId ?? "" : unit?.id ?? ""}>{unitOptions(unitEdit?.id ?? null)}</select></label>
              </div>
              <label className={s.field}><span className={s.label}>{t("settingsOrg.unitHeadcount")}</span>
                <input className={s.input} data-size="money" name="headcount" type="number" min={0} defaultValue={unitEdit?.headcount ?? 0} /></label>
              {errorLine}
            </div>
            <div className={s.drawerFoot}>
              {unitEdit ? <button type="button" className={s.ghostDanger} onClick={() => setConfirm({ kind: "unit", unit: unitEdit })} data-testid="settings-org-unit-remove">{t("settingsOrg.deleteUnit")}</button> : <span />}
              <span className={s.dialogButtons}>
                <button type="button" className={s.soft} onClick={() => setUnitDrawer(null)}>{t("settingsOrg.cancel")}</button>
                <button type="submit" className={s.save} disabled={pending || demo} data-testid={unitEdit ? "settings-org-unit-save" : "settings-org-unit-add"}>{t("settingsOrg.save")}</button>
              </span>
            </div>
          </form>
        </div>
      ) : null}

      {roleDrawer ? (
        <div className={s.scrim} onClick={() => setRoleDrawer(null)}>
          <form key={roleEdit?.id ?? "new"} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="role-drawer-title" onClick={(e) => e.stopPropagation()} onSubmit={saveRole} data-testid="settings-org-role-drawer">
            <div className={s.drawerHead}>
              <h2 id="role-drawer-title" className={s.drawerTitle}>{roleEdit ? roleEdit.title : t("settingsOrg.newRole")}</h2>
              <button type="button" className={s.close} aria-label={t("settingsOrg.close")} onClick={() => setRoleDrawer(null)}>×</button>
            </div>
            <div className={s.drawerBody}>
              {error === "settingsOrg.errRoleOnRoute" ? (
                <div className={o.refusal} role="alert">{t(error)}<Link href={`/${slug}/settings/routing`}>{t("settingsOrg.routingTitle")} →</Link></div>
              ) : null}
              <label className={s.field}><span className={s.label}>{t("settingsOrg.roleTitle")}</span>
                <input className={s.input} name="title" required defaultValue={roleEdit?.title ?? ""} autoFocus data-testid="settings-org-role-title" /></label>
              <div className={o.pair}>
                <label className={s.field}><span className={s.label}>{t("settingsOrg.roleUnit")}</span>
                  <select className={s.input} name="orgUnitId" defaultValue={roleEdit?.orgUnitId ?? unit?.id ?? rows[0]?.unit.id}>
                    {rows.map(({ unit: u, depth }) => <option key={u.id} value={u.id}>{"– ".repeat(depth) + u.name}</option>)}
                  </select></label>
                <label className={s.field}><span className={s.label}>{t("settingsOrg.roleReportsTo")}</span>
                  <select className={s.input} name="reportsToId" defaultValue={roleEdit?.reportsToId ?? ""} data-testid="settings-org-role-reports">{bossOptions(roleEdit?.id ?? null)}</select></label>
              </div>
              {roleEdit ? (
                <div className={s.field}>
                  <span className={s.label}>{t("settingsOrg.seats")}</span>
                  <ul className={o.seatList}>
                    {seatsOf(roleEdit.id).map((h) => (
                      <li key={h.id} className={o.seatRow} data-testid={`settings-org-seat-${h.id}`}>
                        {h.userId ? <PersonFace name={memberName(h.userId) ?? h.name} size="sm" /> : <span className={s.vacant}>{t("settingsOrg.vacant")}</span>}
                        <span className={o.seatName}>{h.userId ? memberName(h.userId) ?? h.name : h.name}</span>
                        <select className={`${s.input} ${o.seatSelect}`} aria-label={t("settingsOrg.seatMember")} value={h.userId ?? ""} disabled={pending || demo}
                          data-testid="settings-org-seat-link" onChange={(e) => run(() => linkSeatAction(slug, h.id, orNull(e.target.value)))}>
                          <option value="">{t("settingsOrg.linkMember")}</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <button type="button" className={s.chipX} aria-label={t("settingsOrg.remove")} disabled={pending || demo} onClick={() => run(() => removeSeatAction(slug, h.id))}>×</button>
                      </li>
                    ))}
                  </ul>
                  <div className={o.seatAdd}>
                    <input className={s.input} name="seatName" placeholder={t("settingsOrg.seatName")} aria-label={t("settingsOrg.seatName")} data-testid="settings-org-seat-name" />
                    <select className={s.input} name="seatUser" aria-label={t("settingsOrg.seatMember")} data-testid="settings-org-seat-member">
                      <option value="">{t("settingsOrg.seatNoMember")}</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <button type="button" className={s.soft} disabled={pending || demo} data-testid="settings-org-seat-add"
                      onClick={(e) => {
                        const form = e.currentTarget.form;
                        if (!form) return;
                        const f = new FormData(form);
                        const userId = orNull(text(f, "seatUser"));
                        const name = text(f, "seatName") || members.find((m) => m.id === userId)?.name || "";
                        run(() => addSeatAction(slug, roleEdit.id, name, userId), () => {
                          const input = form.elements.namedItem("seatName");
                          if (input instanceof HTMLInputElement) input.value = "";
                        });
                      }}>{t("settingsOrg.addSeat")}</button>
                  </div>
                </div>
              ) : null}
              <div className={s.field}>
                <span className={s.label}>{t("settingsOrg.decides")}</span>
                <ChipField name="decides" initial={roleEdit?.decides ?? []} label={t("settingsOrg.addDecision")} />
              </div>
              <label className={s.field}><span className={s.label}>{t("settingsOrg.spendLimit")}</span>
                <span className={s.inline}>
                  <input className={s.input} data-size="money" name="spend" type="number" min={0} defaultValue={roleEdit?.spendLimitEur ?? ""} />
                  <span className={s.unit}>€</span>
                  <span className={s.mute}>{t("settingsOrg.spendEmpty")}</span>
                </span></label>
              {error !== "settingsOrg.errRoleOnRoute" ? errorLine : null}
            </div>
            <div className={s.drawerFoot}>
              {roleEdit ? <button type="button" className={s.ghostDanger} onClick={() => setConfirm({ kind: "role", role: roleEdit })} data-testid="settings-org-role-remove">{t("settingsOrg.deleteRole")}</button> : <span />}
              <span className={s.dialogButtons}>
                <button type="button" className={s.soft} onClick={() => setRoleDrawer(null)}>{t("settingsOrg.cancel")}</button>
                <button type="submit" className={s.save} disabled={pending || demo} data-testid={roleEdit ? "settings-org-role-save" : "settings-org-role-add"}>{t("settingsOrg.save")}</button>
              </span>
            </div>
          </form>
        </div>
      ) : null}

      {confirm ? (
        <div className={s.scrim} onClick={() => setConfirm(null)}>
          <div className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="org-confirm-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="org-confirm-title" className={s.cardTitle}>
              {confirm.kind === "unit" ? t("settingsOrg.deleteUnitAsk", { name: confirm.unit.name }) : t("settingsOrg.deleteRoleAsk", { name: confirm.role.title })}
            </h2>
            <p className={s.dialogText}>{confirm.kind === "unit" ? t("settingsOrg.deleteUnitText") : t("settingsOrg.deleteRoleText")}</p>
            <div className={s.dialogButtons}>
              <button type="button" className={s.soft} onClick={() => setConfirm(null)}>{t("settingsOrg.cancel")}</button>
              <button type="button" className={s.dangerBtn} disabled={pending || demo} data-testid="settings-org-delete-yes"
                onClick={() => {
                  // A refusal shows in the drawer underneath, so the dialog closes either way.
                  const c = confirm;
                  setConfirm(null);
                  run(
                    () => (c.kind === "unit" ? removeUnitAction(slug, c.unit.id) : removeRoleAction(slug, c.role.id)),
                    () => { setUnitDrawer(null); setRoleDrawer(null); if (c.kind === "unit") setPicked(null); },
                  );
                }}>
                {confirm.kind === "unit" ? t("settingsOrg.deleteUnit") : t("settingsOrg.deleteRole")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
