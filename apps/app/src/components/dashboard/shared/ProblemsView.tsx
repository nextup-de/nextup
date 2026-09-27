"use client";
// Problems named by employees: clustered signals, ranked, with the ideas raised against each.
// Port of the PROBLEMS block in legacy/demo/index.html. Sort, filter and the search box narrow
// the list; the right panel shows the selected problem.
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { scopedProblems, sortProblems, type ProblemSort } from "@/components/dashboard/derive";
import { Bars, Empty, Pill, Quote, Tile, ownerTone, statusTone, trendTone } from "@/components/dashboard/shared/primitives";
import { FilterStrip, ListTools, ViewHead, type Chip } from "@/components/dashboard/shared/ViewHead";
import { hits, ownerLabel, problemHay, tokens } from "@/features/search";
import { fmt } from "@/lib/utils/format";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./ProblemsView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

const SORTS: { id: ProblemSort; label: string }[] = [
  { id: "people", label: "Most people affected" }, { id: "trend", label: "Getting worse fastest" }, { id: "age", label: "Longest open" }, { id: "title", label: "A → Z" },
];
const TRENDS = ["Worsening", "Flat", "Improving"];
const OWNERS = ["none", "ideas", "trial"];

export function ProblemsView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { seed, D, N, demo, dept, q, setQ, href, deptName, ready } = ctx;
  const [pid, setPid] = useState<string | null>(initialId ?? null);
  const [sort, setSort] = useState<ProblemSort>("people");
  const [trend, setTrend] = useState("All");
  const [owner, setOwner] = useState("All");
  if (!ready) return <PageSkeleton kind="list" delay />;

  const toks = tokens(q), hasQuery = toks.length > 0;
  const scope = scopedProblems(ctx);
  const searched = scope.filter((p) => !hasQuery || hits(problemHay(p, seed.depts), toks));
  const pool = searched.filter((p) => (trend === "All" || p.trend === trend) && (owner === "All" || p.owner === owner));
  const sorted = sortProblems(pool, sort);
  const sp = sorted.find((p) => p.id === pid) ?? sorted[0] ?? null;

  const filterCount = (trend !== "All" ? 1 : 0) + (owner !== "All" ? 1 : 0);
  const filtered = (filterCount > 0 || hasQuery) && scope.length > 0;
  const showing = "Showing " + sorted.length + " of " + scope.length + " problems";
  const countBy = (list: typeof scope, fn: (p: (typeof scope)[number]) => boolean) => list.filter(fn).length;
  const facets = [
    { key: "trend", label: "Trend", value: trend, onSel: setTrend,
      options: [{ id: "All", label: "All", count: countBy(searched, (p) => owner === "All" || p.owner === owner) }].concat(TRENDS.map((t) => ({ id: t, label: t, count: countBy(searched, (p) => p.trend === t && (owner === "All" || p.owner === owner)) }))) },
    { key: "owner", label: "Ownership", value: owner, onSel: setOwner,
      options: [{ id: "All", label: "All", count: countBy(searched, (p) => trend === "All" || p.trend === trend) }].concat(OWNERS.map((o) => ({ id: o, label: ownerLabel(o), count: countBy(searched, (p) => p.owner === o && (trend === "All" || p.trend === trend)) }))) },
  ];
  const chips: Chip[] = [];
  if (hasQuery) chips.push({ label: "“" + q.trim() + "”", onRemove: () => setQ("") });
  if (trend !== "All") chips.push({ label: trend, onRemove: () => setTrend("All") });
  if (owner !== "All") chips.push({ label: ownerLabel(owner), onRemove: () => setOwner("All") });
  const clearFilters = () => { setTrend("All"); setOwner("All"); };
  const clearAll = () => { setQ(""); clearFilters(); };

  const done = demo ? seed.metrics.discovery.interviewed : 0;
  const pct = N.people ? Math.round((done / N.people) * 100) : 0;

  return (
    <>
      <ViewHead view="problems"
        tools={<ListTools sort={sort} sortOptions={SORTS} onSort={(id) => setSort(id as ProblemSort)} facets={facets} filterCount={filterCount} onClearFilters={clearFilters} showingLabel={showing} />}
        strip={filtered ? <FilterStrip showingLabel={showing} chips={chips} onClearAll={clearAll} /> : undefined} />
      <div className={ui.split}>
        <div className={`${ui.card} ${ui.cardList}`}>
          <div className={styles.discovery}>
            <div>
              <div className={ui.eyebrow}>Discovery round {demo ? seed.metrics.discovery.round : 1}</div>
              <div className={styles.discoveryDone}>{fmt(done)} of {fmt(N.people)} interviewed</div>
            </div>
            <div className={styles.discoveryBar}>
              <div className={styles.discoveryTrack}><div className={styles.discoveryFill} style={{ width: pct + "%" }} /></div>
              <div className={styles.discoveryNote}>{demo ? seed.metrics.discovery.note : "Round 1 not started"}</div>
            </div>
            <div className={styles.discoveryHint}>Interviews run twice a year. Between rounds the same problems keep arriving through the app — that is what moves the trend.</div>
          </div>

          <div>
            {sorted.length === 0 && (
              <Empty
                title={filtered ? "No problems match" : demo ? "Nobody in " + (dept === "All" ? "the company" : deptName(dept)) + " has named a problem yet" : "No problems recorded yet"}
                sub={filtered ? "Try fewer words, or clear the search and filters to see everything in scope."
                  : demo ? "Either nothing here is broken, or nobody has said so yet. Silence from a whole department is usually the second one."
                    : "Problems arrive two ways: a forwarded email thread, or one field in the app. The first interview round clusters them into root problems."}>
                {filtered && <button type="button" className={ui.ghost} onClick={clearAll}>Clear search and filters</button>}
              </Empty>
            )}
            <div className={ui.list}>
              {sorted.map((p) => (
                <div key={p.id} className={ui.row} data-active={sp?.id === p.id ? "true" : undefined} onClick={() => setPid(p.id)}>
                  <div className={ui.mark} />
                  <div className={ui.rowBody}>
                    <div className={styles.rowTop}>
                      <div className={styles.rowMain}>
                        <div className={ui.rowTitle}>{p.title}</div>
                        <div className={ui.rowSub}>{p.sub}</div>
                      </div>
                      <div className={styles.rowRight}>
                        <div className={styles.people}>
                          <div className={styles.peopleN}>{p.people}</div>
                          <div className={styles.peopleL}>people</div>
                        </div>
                        <Bars spark={p.spark} size="md" tone={p.trend === "Improving" ? "light" : undefined} />
                      </div>
                    </div>
                    <div className={`${ui.chips} ${styles.rowChips}`}>
                      <Pill tone={trendTone(p.trend)}>{p.trend}</Pill>
                      <Pill tone={ownerTone(p.owner)}>{ownerLabel(p.owner)}</Pill>
                      <span className={ui.rowMeta}>
                        {p.depts.length > 3 ? p.depts.slice(0, 3).map(deptName).join(" · ") + " +" + (p.depts.length - 3) : p.depts.map(deptName).join(" · ")}
                        {" · "}{p.months >= 9 ? "found in interviews" : "reported in the app"} · first raised {p.age}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`${ui.card} ${ui.sticky}`}>
          <div className={ui.eyebrow}>{sp ? "Selected problem" : "Nothing selected"}</div>
          <div className={ui.h2}>{sp ? sp.title : "No problem to show"}</div>
          <div className={`${ui.body} ${ui.mt8}`}>
            {sp ? sp.detail : demo ? "No problems are recorded for this department yet. Clear the scope to see the rest of the company." : "Nothing has been raised yet. The first forwarded thread or typed problem opens a case here."}
          </div>
          <div className={`${ui.grid2} ${styles.tiles}`}>
            <Tile v={sp ? sp.people : "0"} l="people affected" />
            <Tile v={sp ? sp.timeLost : "—"} l="est. time lost / month" />
          </div>
          <div className={`${ui.eyebrow} ${ui.mt20}`}>In their words</div>
          <div className={styles.quotes}>
            {(sp?.signals ?? []).map((s) => <Quote key={s.quote} text={s.quote} by={s.by} />)}
          </div>
          <div className={`${ui.eyebrow} ${ui.mt20}`}>Ideas against this problem</div>
          <div className={styles.linked}>
            {(sp?.ideas ?? []).map((id) => D.ideas.find((i) => i.id === id)).filter((i) => !!i).map((i) => (
              <Link key={i.id} href={href("/ideas?id=" + i.id)} className={styles.linkedIdea}>
                <span className={`${ui.tileTitle} ${styles.linkedTitle}`}>{i.title}</span>
                <Pill tone={statusTone(i.status)}>{i.status}</Pill>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
