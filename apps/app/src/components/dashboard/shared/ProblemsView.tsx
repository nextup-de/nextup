"use client";
// Problems named by employees: clustered signals, ranked, with the ideas raised against each.
// Port of the PROBLEMS block in legacy/demo/index.html. Sort, filter and the search box narrow
// the list; the right panel shows the selected problem.
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { scopedProblems, sortProblems, type ProblemSort } from "@/components/dashboard/derive";
import { Bars, Empty, Pill, Quote, Tile, ownerTone, statusTone, trendTone, wordText } from "@/components/dashboard/shared/primitives";
import { FilterStrip, ListTools, ViewHead, type Chip } from "@/components/dashboard/shared/ViewHead";
import { hits, problemHay, tokens } from "@/features/search";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./ProblemsView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

const SORTS: { id: ProblemSort; msg: MessageKey }[] = [
  { id: "people", msg: "dashboard.problemsSortPeople" }, { id: "trend", msg: "dashboard.problemsSortTrend" }, { id: "age", msg: "dashboard.problemsSortAge" }, { id: "title", msg: "dashboard.sortAZ" },
];
const TRENDS = ["Worsening", "Flat", "Improving"];
const OWNERS = ["none", "ideas", "trial"];
const OWNER_LABEL: Record<string, MessageKey> = { none: "dashboard.ownerNone", trial: "dashboard.ownerTrial", ideas: "dashboard.ownerIdeas" };

export function ProblemsView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { seed, D, N, demo, dept, q, setQ, href, deptName, ready } = ctx;
  const t = useT();
  const fmt = useFormat();
  const ownerLabel = (o: string) => t(OWNER_LABEL[o] ?? "dashboard.ownerIdeas");
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
  const showing = t("dashboard.problemsShowing", { n: sorted.length, total: scope.length });
  const countBy = (list: typeof scope, fn: (p: (typeof scope)[number]) => boolean) => list.filter(fn).length;
  const facets = [
    { key: "trend", label: t("dashboard.problemsFacetTrend"), value: trend, onSel: setTrend,
      options: [{ id: "All", label: t("dashboard.listAll"), count: countBy(searched, (p) => owner === "All" || p.owner === owner) }].concat(TRENDS.map((tr) => ({ id: tr, label: wordText(t, tr), count: countBy(searched, (p) => p.trend === tr && (owner === "All" || p.owner === owner)) }))) },
    { key: "owner", label: t("dashboard.problemsFacetOwner"), value: owner, onSel: setOwner,
      options: [{ id: "All", label: t("dashboard.listAll"), count: countBy(searched, (p) => trend === "All" || p.trend === trend) }].concat(OWNERS.map((o) => ({ id: o, label: ownerLabel(o), count: countBy(searched, (p) => p.owner === o && (trend === "All" || p.trend === trend)) }))) },
  ];
  const chips: Chip[] = [];
  if (hasQuery) chips.push({ label: t("dashboard.chipQuery", { q: q.trim() }), onRemove: () => setQ("") });
  if (trend !== "All") chips.push({ label: wordText(t, trend), onRemove: () => setTrend("All") });
  if (owner !== "All") chips.push({ label: ownerLabel(owner), onRemove: () => setOwner("All") });
  const clearFilters = () => { setTrend("All"); setOwner("All"); };
  const clearAll = () => { setQ(""); clearFilters(); };

  const done = demo ? seed.metrics.discovery.interviewed : 0;
  const pct = N.people ? Math.round((done / N.people) * 100) : 0;

  return (
    <>
      <ViewHead view="problems"
        tools={<ListTools sort={sort} sortOptions={SORTS.map((o) => ({ id: o.id, label: t(o.msg) }))} onSort={(id) => setSort(id as ProblemSort)} facets={facets} filterCount={filterCount} onClearFilters={clearFilters} showingLabel={showing} />}
        strip={filtered ? <FilterStrip showingLabel={showing} chips={chips} onClearAll={clearAll} /> : undefined} />
      <div className={ui.split}>
        <div className={`${ui.card} ${ui.cardList}`}>
          <div className={styles.discovery}>
            <div>
              <div className={ui.eyebrow}>{t("dashboard.problemsDiscoveryRound", { n: demo ? seed.metrics.discovery.round : 1 })}</div>
              <div className={styles.discoveryDone}>{t("dashboard.problemsInterviewed", { done: fmt.number(done), total: fmt.number(N.people) })}</div>
            </div>
            <div className={styles.discoveryBar}>
              <div className={styles.discoveryTrack}><div className={styles.discoveryFill} style={{ width: pct + "%" }} /></div>
              <div className={styles.discoveryNote}>{demo ? seed.metrics.discovery.note : t("dashboard.problemsRound1")}</div>
            </div>
            <div className={styles.discoveryHint}>{t("dashboard.problemsDiscoveryHint")}</div>
          </div>

          <div>
            {sorted.length === 0 && (
              <Empty
                title={filtered ? t("dashboard.problemsNoMatch") : demo ? t("dashboard.problemsNobodyNamed", { where: dept === "All" ? t("dashboard.problemsTheCompany") : deptName(dept) }) : t("dashboard.problemsNone")}
                sub={filtered ? t("dashboard.ideasEmptyFiltered")
                  : demo ? t("dashboard.problemsEmptyDemo")
                    : t("dashboard.problemsEmptyLive")}>
                {filtered && <button type="button" className={ui.ghost} onClick={clearAll}>{t("dashboard.ideasClearSearch")}</button>}
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
                          <div className={styles.peopleL}>{t("dashboard.problemsPeople")}</div>
                        </div>
                        <Bars spark={p.spark} size="md" tone={p.trend === "Improving" ? "light" : undefined} />
                      </div>
                    </div>
                    <div className={`${ui.chips} ${styles.rowChips}`}>
                      <Pill tone={trendTone(p.trend)}>{wordText(t, p.trend)}</Pill>
                      <Pill tone={ownerTone(p.owner)}>{ownerLabel(p.owner)}</Pill>
                      <span className={ui.rowMeta}>
                        {p.depts.length > 3 ? p.depts.slice(0, 3).map(deptName).join(" · ") + " +" + (p.depts.length - 3) : p.depts.map(deptName).join(" · ")}
                        {" · "}{p.months >= 9 ? t("dashboard.problemsFoundInterviews") : t("dashboard.problemsReportedApp")} · {t("dashboard.problemsFirstRaised", { age: p.age })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`${ui.card} ${ui.sticky}`}>
          <div className={ui.eyebrow}>{sp ? t("dashboard.problemsSelected") : t("dashboard.problemsNothingSelected")}</div>
          <div className={ui.h2}>{sp ? sp.title : t("dashboard.problemsNoneToShow")}</div>
          <div className={`${ui.body} ${ui.mt8}`}>
            {sp ? sp.detail : demo ? t("dashboard.problemsDetailDemo") : t("dashboard.problemsDetailLive")}
          </div>
          <div className={`${ui.grid2} ${styles.tiles}`}>
            <Tile v={sp ? sp.people : "0"} l={t("dashboard.problemsPeopleAffected")} />
            <Tile v={sp ? sp.timeLost : "—"} l={t("dashboard.problemsTimeLost")} />
          </div>
          <div className={`${ui.eyebrow} ${ui.mt20}`}>{t("dashboard.problemsInTheirWords")}</div>
          <div className={styles.quotes}>
            {(sp?.signals ?? []).map((s) => <Quote key={s.quote} text={s.quote} by={s.by} />)}
          </div>
          <div className={`${ui.eyebrow} ${ui.mt20}`}>{t("dashboard.problemsIdeasAgainst")}</div>
          <div className={styles.linked}>
            {(sp?.ideas ?? []).map((id) => D.ideas.find((i) => i.id === id)).filter((i) => !!i).map((i) => (
              <Link key={i.id} href={href("/ideas?id=" + i.id)} className={styles.linkedIdea}>
                <span className={`${ui.tileTitle} ${styles.linkedTitle}`}>{i.title}</span>
                <Pill tone={statusTone(i.status)}>{wordText(t, i.status)}</Pill>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
