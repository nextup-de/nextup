// The Data page's picture of one company's knowledge (docs/plans/2026-10-21_company-data-page.md):
// units as a treemap, the role tree folded to fit, the routing table as a grid of cells, goals as
// chips - and the raw rows and the model's text behind a toggle. It replaces the five tables the
// page used to render in full, which stopped being readable somewhere past 50 roles. Counts and
// roles only; no holder's name is drawn here. Props in, JSX out - the unit filter is a link.
import type { CSSProperties } from "react";
import {
  orgStats, roleForest, routingHealth, STATUS_LABEL, TREE_H, TREE_W, unitTiles,
  type RoleBranch, type RuleStatus, type UnitTile,
} from "@/features/admin/org-visual";
import type { Knowledge, Profile } from "@/features/knowledge";
import styles from "@/app/admin/admin.module.css";

type Props = {
  knowledge: Knowledge;
  profile: Profile | null;
  /** The unit the role tree is narrowed to, by key. */
  unit?: string;
  /** Link to this page narrowed to a unit (or to all of them for null). */
  hrefFor: (unitKey: string | null) => string;
};

const ROWS = 50;
const num = (n: number) => n.toLocaleString("en-GB");
const css = (v: Record<string, string | number>) => v as CSSProperties;

function Stat({ value, label, tone }: { value: string; label: string; tone?: "warn" }) {
  return (
    <li className={styles.stat} data-tone={tone}>
      <strong>{value}</strong>
      <span>{label}</span>
    </li>
  );
}

function Tile({ t, current, href }: { t: UnitTile; current: boolean; href: string }) {
  const place = css({ "--x": `${(t.rect.x / TREE_W) * 100}%`, "--y": `${(t.rect.y / TREE_H) * 100}%`, "--w": `${(t.rect.w / TREE_W) * 100}%`, "--h": `${(t.rect.h / TREE_H) * 100}%` });
  const title = `${t.name}: ${num(t.headcount)} people, ${t.roles} roles, owns ${t.owned} routing rows${t.vacant ? `, ${t.vacant} roles nobody holds` : ""}`;
  return (
    <a href={href} className={styles.tile} style={place} data-tone={t.tone} data-label={t.label} data-depth={t.depth} aria-current={current ? "true" : undefined} title={title}>
      {t.label === "none" ? <span className={styles.srOnly}>{t.name}</span> : <span className={styles.tileName}>{t.tone === "group" && t.label === "full" ? `${t.name} · ${num(t.headcount)}` : t.name}</span>}
      {t.label === "full" && t.tone !== "group" ? <span className={styles.tileMeta}>{num(t.headcount)} people · {t.owned} routes</span> : null}
    </a>
  );
}

function Branch({ b, depth }: { b: RoleBranch; depth: number }) {
  const row = (
    <>
      <span className={styles.roleTitle}>{b.title}</span>
      <span className={styles.roleUnit}>{b.unit}</span>
      <span className={styles.roleHold} data-tone={b.holders === 0 ? "warn" : undefined}>{b.holders === 0 ? "vacant" : `${b.holders} ${b.holders === 1 ? "person" : "people"}`}</span>
      {b.total > 1 ? <span className={styles.roleTotal}>{num(b.total)} roles</span> : null}
    </>
  );
  if (b.children.length === 0 && b.hidden === 0) return <div className={styles.roleLeaf}>{row}</div>;
  return (
    <details className={styles.roleNode} open={depth < 1}>
      <summary className={styles.roleSummary}>{row}</summary>
      <div className={styles.roleKids}>
        {b.children.map((c) => <Branch key={c.id} b={c} depth={depth + 1} />)}
        {b.hidden > 0 ? <p className={styles.sub}>+{b.hidden} smaller {b.hidden === 1 ? "role" : "roles"} under {b.title} not drawn. Narrow to a unit to see them.</p> : null}
      </div>
    </details>
  );
}

const STATUS_ORDER: RuleStatus[] = ["complete", "no-deputy", "no-buddy", "vacant-owner", "no-owner"];

export function KnowledgeVisual({ knowledge: k, profile, unit, hrefFor }: Props) {
  const stats = orgStats(k);
  const tiles = unitTiles(k);
  const forest = roleForest(k, unit);
  const health = routingHealth(k);
  const current = k.units.find((u) => u.key === unit);
  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const bySort = <T extends { sort: number }>(xs: readonly T[]) => [...xs].sort((a, b) => a.sort - b.sort);
  const ranked = [...tiles].sort((a, b) => b.headcount - a.headcount).slice(0, 10);
  const widest = Math.max(1, ...ranked.map((t) => t.headcount));
  const profiled = profile && (profile.vision || profile.mission || profile.businessModel || profile.principles.length);

  return (
    <>
      <section className={styles.card}>
        <h2>Organisation</h2>
        {k.units.length === 0 ? (
          <p className="nh-hint">No units yet.</p>
        ) : (
          <>
            <p className="nh-hint">Each box is a unit, sized by its people. The colour says how many routing rows it owns, so a pale box is somewhere an idea cannot be sent. Click one to narrow the role tree below.</p>
            <ul className={styles.stats} aria-label="Organisation in numbers">
              <Stat value={num(stats.people)} label="people" />
              <Stat value={num(stats.units)} label="units" />
              <Stat value={num(stats.roles)} label="roles" />
              <Stat value={`${stats.span || "-"}`} label="reports per manager" />
              <Stat value={String(stats.depth)} label="levels" />
              <Stat value={num(stats.vacant)} label="roles nobody holds" tone={stats.vacant ? "warn" : undefined} />
              <Stat value={num(stats.deadEnds)} label="units that own no routing row" tone={stats.deadEnds ? "warn" : undefined} />
            </ul>
            <div className={styles.treemap} role="group" aria-label="Units by size">
              {tiles.map((t) => <Tile key={t.id} t={t} current={t.key === unit} href={hrefFor(t.key)} />)}
            </div>
            <ol className={styles.bars} aria-label="Largest units">
              {ranked.map((t) => (
                <li key={t.id}>
                  <a href={hrefFor(t.key)} aria-current={t.key === unit ? "true" : undefined}>
                    <span>{t.name}</span>
                    <span className={styles.bar} style={css({ "--share": `${(t.headcount / widest) * 100}%` })} data-tone={t.tone} />
                    <span className={styles.sub}>{num(t.headcount)}</span>
                  </a>
                </li>
              ))}
            </ol>
            <p className={styles.legend} aria-hidden="true">
              <span data-tone="none">owns none</span><span data-tone="low">1 row</span><span data-tone="mid">2 to 3</span><span data-tone="high">4 or more</span><span data-tone="group">holds other units</span>
            </p>
          </>
        )}
      </section>

      <section className={styles.card}>
        <h2>Who reports to whom {current ? <span className={styles.sub}>{current.name}</span> : null}</h2>
        {forest.roots.length === 0 ? (
          <p className="nh-hint">No roles{current ? ` in ${current.name}` : ""} yet.</p>
        ) : (
          <>
            <p className="nh-hint">
              The structure is between roles; a role is shown with how many people hold it, never who. The first level is open, the rest
              unfolds on click.{" "}
              {current ? <a href={hrefFor(null)}>Show all units</a> : null}
            </p>
            <div className={styles.roleTree}>
              {forest.roots.map((b) => <Branch key={b.id} b={b} depth={0} />)}
            </div>
            {forest.shown < forest.total ? (
              <p className={styles.sub}>Showing {num(forest.shown)} of {num(forest.total)} roles, the largest teams first. Click a unit above to see the rest.</p>
            ) : null}
          </>
        )}
      </section>

      <section className={styles.card}>
        <h2>Who answers what <span className={styles.sub}>{num(k.rules.length)} routing rows</span></h2>
        {health.cells.length === 0 ? (
          <p className="nh-hint">No routing rows yet. Without them every raise lands as &quot;no route&quot;.</p>
        ) : (
          <>
            <p className="nh-hint">One square per routing row. Green means an owner, a deputy and a buddy exist and someone holds each of those roles.</p>
            <ul className={styles.chips} aria-label="Routing rows by state">
              {STATUS_ORDER.filter((s) => health.counts[s] > 0).map((s) => (
                <li key={s} data-status={s}>{num(health.counts[s])} {STATUS_LABEL[s]}</li>
              ))}
            </ul>
            <div className={styles.cells} role="img" aria-label={`${health.counts.complete} of ${health.cells.length} routing rows complete`}>
              {health.cells.map((c) => <span key={c.key} data-status={c.status} title={`${c.type}: ${STATUS_LABEL[c.status]}`} />)}
            </div>
            {health.gaps.length ? (
              <ul className={styles.gaps}>
                {health.gaps.map((g) => (
                  <li key={g.key}><span data-status={g.status} className={styles.gapDot} aria-hidden="true" /><strong>{g.type}</strong> <span className={styles.sub}>{STATUS_LABEL[g.status]}{g.owner ? ` · ${g.owner}` : ""}</span></li>
                ))}
                {health.cells.length - health.counts.complete > health.gaps.length ? (
                  <li className={styles.sub}>and {num(health.cells.length - health.counts.complete - health.gaps.length)} more</li>
                ) : null}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <section className={styles.card}>
        <h2>Goals <span className={styles.sub}>{k.goals.length}</span></h2>
        {k.goals.length ? (
          <ul className={styles.chips} aria-label="Goals">
            {bySort(k.goals).map((g) => (
              <li key={g.id} data-status="goal">{g.title}{g.orgUnitId ? <span className={styles.sub}> {unitName.get(g.orgUnitId)}</span> : null}</li>
            ))}
          </ul>
        ) : (
          <p className="nh-hint">No goals yet.</p>
        )}
        {profiled ? (
          <p className="nh-hint">{[profile.vision && `Vision: ${profile.vision}`, profile.mission && `Mission: ${profile.mission}`].filter(Boolean).join(" · ")}</p>
        ) : (
          <p className="nh-hint">No profile yet. Vision, mission and principles will be edited here in step 3 of the plan.</p>
        )}
      </section>

    </>
  );
}

/** The first rows of the tables and the exact text a model is given, folded away until asked for. */
export function KnowledgeRaw({ knowledge: k, brief }: { knowledge: Knowledge; brief: string }) {
  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const bySort = <T extends { sort: number }>(xs: readonly T[]) => [...xs].sort((a, b) => a.sort - b.sort);
  return (
    <section className={styles.card}>
      <h2>The rows and the model&apos;s text</h2>
      <details className={styles.raw}>
        <summary>Show the first {ROWS} rows of each table</summary>
        <h3>Units <span className={styles.sub}>{num(k.units.length)}</span></h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Key</th><th>Name</th><th>Kind</th><th>People</th><th>Roles</th></tr></thead>
            <tbody>
              {bySort(k.units).slice(0, ROWS).map((u) => (
                <tr key={u.id}>
                  <td><code>{u.key}</code></td>
                  <td>{u.name}{u.parentId ? <span className={styles.sub}>under {unitName.get(u.parentId)}</span> : null}</td>
                  <td>{u.kind}</td>
                  <td>{num(u.headcount)}</td>
                  <td>{k.roles.filter((r) => r.orgUnitId === u.id && r.title).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {k.units.length > ROWS ? <p className={styles.sub}>Showing {ROWS} of {num(k.units.length)}.</p> : null}
        <h3>Routing table <span className={styles.sub}>{num(k.rules.length)}</span></h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Key</th><th>Request type</th><th>Keywords</th><th>Wait</th></tr></thead>
            <tbody>
              {bySort(k.rules).slice(0, ROWS).map((r) => (
                <tr key={r.id}>
                  <td><code>{r.key}</code></td>
                  <td>{r.type}</td>
                  <td className={styles.sub}>{r.keywords.join(", ")}</td>
                  <td className={styles.nowrap}>{r.wait}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {k.rules.length > ROWS ? <p className={styles.sub}>Showing {ROWS} of {num(k.rules.length)}.</p> : null}
      </details>
      <details className={styles.raw}>
        <summary>What a model would read</summary>
        <p className="nh-hint">
          The company brief (features/knowledge companyBrief): roles, never names. This exact text is what an LLM router is
          handed, so a wrong row here is a wrong answer there.
        </p>
        <pre className={styles.brief}>{brief}</pre>
      </details>
    </section>
  );
}
