// /admin/knowledge: one company's knowledge tables as the software team needs to see them - units,
// the role tree, the routing table, goals - and, last, the exact text a model would be given.
// Props in, JSX out.
import type { CSSProperties } from "react";
import { roleTree, type Knowledge, type Profile } from "@/features/knowledge";
import { someNames } from "@/features/admin/list";
import { DeptChip, PersonFace, SectionCard } from "@/components/ui/elements";
import { getT } from "@/i18n/server";
import { SearchTable } from "./SearchTable";
import c from "@/app/admin/people/console.module.css";

type Props = { knowledge: Knowledge; profile: Profile | null; brief: string };

/** Names in a cell before "+12 more": a role held by half the plant must not fill the page. */
const NAMES_IN_CELL = 3;

export async function KnowledgeView({ knowledge: k, profile, brief }: Props) {
  const t = await getT();
  const none = t("adminConsole.none");
  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const tree = roleTree(k);
  const roleById = new Map(k.roles.map((r) => [r.id, r]));
  const more = (n: number) => t("adminConsole.moreNames", { n });
  const holders = (roleId: string | null) => {
    const some = someNames(tree.find((n) => n.role.id === roleId)?.holders ?? [], NAMES_IN_CELL);
    return [...some.names, ...(some.more ? [more(some.more)] : [])].join(", ");
  };
  const role = (id: string | null) => {
    const r = id ? roleById.get(id) : undefined;
    if (!r) return <span className={c.sub}>{t("adminPrivacy.kNone")}</span>;
    return (
      <>
        {r.title || <em>{t("adminPrivacy.kNoTitle")}</em>} <span className={c.sub}>{unitName.get(r.orgUnitId)} · {holders(r.id) || t("adminPrivacy.kNobody")}</span>
      </>
    );
  };
  const bySort = <T extends { sort: number }>(xs: readonly T[]) => [...xs].sort((a, b) => a.sort - b.sort);
  const hasProfile = profile && (profile.vision || profile.mission || profile.businessModel || profile.principles.length);

  return (
    <>
      <SectionCard title={t("adminPrivacy.kProfile")} name="profile">
        {hasProfile ? (
          <dl className={c.facts}>
            {([
              [t("adminPrivacy.kVision"), profile.vision],
              [t("adminPrivacy.kMission"), profile.mission],
              [t("adminPrivacy.kModel"), profile.businessModel],
              [t("adminPrivacy.kPrinciples"), profile.principles.join(" · ")],
            ] as const).map(([label, value]) => (
              <div key={label} className={c.fact}>
                <dt>{label}</dt>
                <dd>{value || none}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={c.note}>{t("adminPrivacy.kProfileEmpty")}</p>
        )}
      </SectionCard>

      <SectionCard title={t("adminPrivacy.kUnits")} hint={t("adminPrivacy.kUnitsMeta", { n: k.units.length })} name="units">
        <SearchTable
          rows={bySort(k.units)}
          rowKey={(u) => u.id}
          searchText={(u) => `${u.key} ${u.name} ${u.kind} ${unitName.get(u.parentId ?? "") ?? ""}`}
          empty={none}
          columns={[
            { key: "key", header: t("adminPrivacy.colKey"), width: "minmax(0, 0.8fr)", render: (u) => <code className={c.mono}>{u.key}</code> },
            {
              key: "name",
              header: t("adminPrivacy.colName"),
              width: "minmax(0, 1.6fr)",
              render: (u) => (
                <>
                  <DeptChip name={u.name} />
                  {u.parentId ? <span className={c.sub}>{t("adminPrivacy.kUnder", { name: unitName.get(u.parentId) ?? "" })}</span> : null}
                </>
              ),
            },
            { key: "kind", header: t("adminPrivacy.colKind"), render: (u) => u.kind },
            { key: "people", header: t("adminPrivacy.colPeople"), width: "90px", render: (u) => u.headcount },
            { key: "roles", header: t("adminPrivacy.colRoles"), width: "90px", render: (u) => k.roles.filter((r) => r.orgUnitId === u.id).length },
          ]}
        />
      </SectionCard>

      <SectionCard title={t("adminPrivacy.kRoles")} hint={`${t("adminPrivacy.kRolesMeta", { roles: k.roles.length, holders: k.holders.length })} - ${t("adminPrivacy.kRolesLead")}`} name="roles">
        <SearchTable
          rows={tree}
          rowKey={(n) => n.role.id}
          searchText={(n) => [n.role.title, n.unit, ...n.holders, ...n.role.decides, ...n.role.skills].filter(Boolean).join(" ")}
          empty={none}
          columns={[
            {
              key: "role",
              header: t("adminPrivacy.colRole"),
              width: "minmax(0, 1.5fr)",
              render: (n) => <span className={c.indent} style={{ "--depth": n.depth } as CSSProperties}>{n.role.title || <em>{t("adminPrivacy.kStandIn")}</em>}</span>,
            },
            { key: "unit", header: t("adminPrivacy.colUnit"), render: (n) => (n.unit ? <DeptChip name={n.unit} /> : none) },
            {
              key: "held",
              header: t("adminPrivacy.colHeldBy"),
              width: "minmax(0, 1.3fr)",
              render: (n) => (
                <span className={c.whoNames} title={n.holders.length > NAMES_IN_CELL ? n.holders.join(", ") : undefined}>
                  {n.holders.slice(0, NAMES_IN_CELL).map((h) => (
                    <span key={h} className={c.whoName}><PersonFace name={h} size="sm" />{h}</span>
                  ))}
                  {n.holders.length > NAMES_IN_CELL ? <span className={c.sub}>{more(n.holders.length - NAMES_IN_CELL)}</span> : null}
                </span>
              ),
            },
            {
              key: "decides",
              header: t("adminPrivacy.colDecides"),
              width: "minmax(0, 1.5fr)",
              render: (n) => (
                <span className={c.sub}>
                  {[
                    n.role.decides.join(", "),
                    n.role.spendLimitEur !== null ? "€" + n.role.spendLimitEur : "",
                    n.role.skills.join(", "),
                  ].filter(Boolean).join(" · ") || none}
                </span>
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title={t("adminPrivacy.kRouting")} hint={t("adminPrivacy.kRoutingMeta", { n: k.rules.length })} name="routing">
        <SearchTable
          rows={bySort(k.rules)}
          rowKey={(r) => r.id}
          searchText={(r) => [r.key, r.type, ...r.keywords, ...[r.ownerRoleId, r.deputyRoleId, r.buddyRoleId].map((id) => (id ? roleById.get(id)?.title : ""))].filter(Boolean).join(" ")}
          empty={none}
          columns={[
            { key: "key", header: t("adminPrivacy.colKey"), width: "minmax(0, 0.6fr)", render: (r) => <code className={c.mono}>{r.key}</code> },
            { key: "type", header: t("adminPrivacy.colType"), render: (r) => r.type },
            { key: "owner", header: t("adminPrivacy.colOwner"), width: "minmax(0, 1.3fr)", render: (r) => role(r.ownerRoleId) },
            { key: "deputy", header: t("adminPrivacy.colDeputy"), width: "minmax(0, 1.3fr)", render: (r) => role(r.deputyRoleId) },
            { key: "buddy", header: t("adminPrivacy.colBuddy"), width: "minmax(0, 1.3fr)", render: (r) => role(r.buddyRoleId) },
            { key: "keywords", header: t("adminPrivacy.colKeywords"), render: (r) => <span className={c.sub}>{r.keywords.join(", ")}</span> },
            { key: "wait", header: t("adminPrivacy.colWait"), width: "70px", render: (r) => <span className={c.nowrap}>{r.wait}</span> },
          ]}
        />
      </SectionCard>

      <SectionCard title={t("adminPrivacy.kGoals")} hint={t("adminPrivacy.kGoalsMeta", { n: k.goals.length })} name="goals">
        <SearchTable
          rows={bySort(k.goals)}
          rowKey={(g) => g.id}
          searchText={(g) => [g.title, g.kpi, g.target, g.period, g.orgUnitId ? unitName.get(g.orgUnitId) : "", ...g.keywords].filter(Boolean).join(" ")}
          empty={t("adminPrivacy.kNoGoals")}
          columns={[
            { key: "goal", header: t("adminPrivacy.colGoal"), width: "minmax(0, 1.6fr)", render: (g) => g.title },
            { key: "unit", header: t("adminPrivacy.colUnit"), render: (g) => (g.orgUnitId ? <DeptChip name={unitName.get(g.orgUnitId) ?? ""} /> : t("adminPrivacy.kCompanyWide")) },
            { key: "kpi", header: t("adminPrivacy.colKpi"), width: "minmax(0, 1.4fr)", render: (g) => <span className={c.sub}>{[g.kpi, g.target, g.period].filter(Boolean).join(" · ") || none}</span> },
            { key: "keywords", header: t("adminPrivacy.colKeywords"), render: (g) => <span className={c.sub}>{g.keywords.join(", ")}</span> },
          ]}
        />
      </SectionCard>

      <SectionCard title={t("adminPrivacy.kBrief")} hint={t("adminPrivacy.kBriefLead")} name="brief">
        <pre className={c.pre}>{brief}</pre>
      </SectionCard>
    </>
  );
}
