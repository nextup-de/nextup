// /admin/knowledge: one company's knowledge tables as the software team needs to see them - units,
// the role tree, the routing table, goals - and, last, the exact text a model would be given.
// Props in, JSX out.
import type { CSSProperties } from "react";
import { roleTree, type Knowledge, type Profile } from "@/features/knowledge";
import styles from "@/app/admin/admin.module.css";

type Props = { knowledge: Knowledge; profile: Profile | null; brief: string };

export function KnowledgeView({ knowledge: k, profile, brief }: Props) {
  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const tree = roleTree(k);
  const roleById = new Map(k.roles.map((r) => [r.id, r]));
  const holders = (roleId: string | null) => tree.find((n) => n.role.id === roleId)?.holders.join(", ") ?? "";
  const role = (id: string | null) => {
    const r = id ? roleById.get(id) : undefined;
    if (!r) return <span className={styles.sub}>none</span>;
    return (
      <>
        {r.title || <em>no title</em>} <span className={styles.sub}>{unitName.get(r.orgUnitId)} · {holders(r.id) || "nobody"}</span>
      </>
    );
  };
  const bySort = <T extends { sort: number }>(xs: readonly T[]) => [...xs].sort((a, b) => a.sort - b.sort);

  return (
    <>
      <section className={styles.card}>
        <h2>Profile</h2>
        {profile && (profile.vision || profile.mission || profile.businessModel || profile.principles.length) ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                <tr><th>Vision</th><td>{profile.vision || "-"}</td></tr>
                <tr><th>Mission</th><td>{profile.mission || "-"}</td></tr>
                <tr><th>Business model</th><td>{profile.businessModel || "-"}</td></tr>
                <tr><th>Principles</th><td>{profile.principles.join(" · ") || "-"}</td></tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="nh-hint">Not filled in yet. Vision, mission, principles and business model will be edited here in step 2 (docs/COMPANY_KNOWLEDGE.md).</p>
        )}
      </section>

      <section className={styles.card}>
        <h2>Units <span className={styles.sub}>{k.units.length} rows · OrgUnit</span></h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Key</th><th>Name</th><th>Kind</th><th>People</th><th>Roles</th></tr></thead>
            <tbody>
              {bySort(k.units).map((u) => (
                <tr key={u.id}>
                  <td><code>{u.key}</code></td>
                  <td>{u.name}{u.parentId ? <span className={styles.sub}>under {unitName.get(u.parentId)}</span> : null}</td>
                  <td>{u.kind}</td>
                  <td>{u.headcount}</td>
                  <td>{k.roles.filter((r) => r.orgUnitId === u.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Roles <span className={styles.sub}>{k.roles.length} roles · {k.holders.length} holders · OrgRole, OrgRoleHolder</span></h2>
        <p className="nh-hint">Indented under the role they report to. The structure is between roles; names are only who holds one.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Role</th><th>Unit</th><th>Held by</th><th>Decides · limit · skills</th></tr></thead>
            <tbody>
              {tree.map((n) => (
                <tr key={n.role.id}>
                  <td><span className={styles.indent} style={{ "--depth": n.depth } as CSSProperties}>{n.role.title || <em>stand-in (not in the org chart)</em>}</span></td>
                  <td>{n.unit}</td>
                  <td>{n.holders.join(", ")}</td>
                  <td className={styles.sub}>
                    {[
                      n.role.decides.join(", "),
                      n.role.spendLimitEur !== null ? "€" + n.role.spendLimitEur : "",
                      n.role.skills.join(", "),
                    ].filter(Boolean).join(" · ") || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Routing table <span className={styles.sub}>{k.rules.length} rows · RoutingRule</span></h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Key</th><th>Request type</th><th>Owner</th><th>Deputy</th><th>Buddy</th><th>Keywords</th><th>Wait</th></tr></thead>
            <tbody>
              {bySort(k.rules).map((r) => (
                <tr key={r.id}>
                  <td><code>{r.key}</code></td>
                  <td>{r.type}</td>
                  <td>{role(r.ownerRoleId)}</td>
                  <td>{role(r.deputyRoleId)}</td>
                  <td>{role(r.buddyRoleId)}</td>
                  <td className={styles.sub}>{r.keywords.join(", ")}</td>
                  <td className={styles.nowrap}>{r.wait}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Goals <span className={styles.sub}>{k.goals.length} rows · Goal</span></h2>
        {k.goals.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Goal</th><th>Unit</th><th>KPI · target · period</th><th>Keywords</th></tr></thead>
              <tbody>
                {bySort(k.goals).map((g) => (
                  <tr key={g.id}>
                    <td>{g.title}</td>
                    <td>{g.orgUnitId ? unitName.get(g.orgUnitId) : "company-wide"}</td>
                    <td className={styles.sub}>{[g.kpi, g.target, g.period].filter(Boolean).join(" · ") || "-"}</td>
                    <td className={styles.sub}>{g.keywords.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="nh-hint">No goals yet.</p>
        )}
      </section>

      <section className={styles.card}>
        <h2>What a model would read</h2>
        <p className="nh-hint">
          The company brief (features/knowledge companyBrief): roles, never names. This exact text is what an LLM router is
          handed, so a wrong row here is a wrong answer there.
        </p>
        <pre className={styles.brief}>{brief}</pre>
      </section>
    </>
  );
}
