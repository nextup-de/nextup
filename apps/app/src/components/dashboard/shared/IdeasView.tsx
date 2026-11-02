"use client";
// Ideas from the organisation, each tagged on the three case criteria. Employees co-sign;
// managers approve (and assign) or fund a trial; anyone can ask a question under it.
// Port of the IDEAS block in legacy/demo/index.html.
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { criteriaTags, problemOf, scopedIdeas, sortIdeas, type IdeaSort } from "@/components/dashboard/derive";
import { Avatar, Btn, Empty, Pill, Tile, statusTone, wordText } from "@/components/dashboard/shared/primitives";
import { FilterStrip, ListTools, ViewHead, type Chip } from "@/components/dashboard/shared/ViewHead";
import type { IdeaStatus } from "@/features/demo/types";
import { hits, ideaHay, tokens } from "@/features/search";
import { useLocale, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./IdeasView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

const SORTS: { id: IdeaSort; msg: MessageKey }[] = [
  { id: "score", msg: "dashboard.ideasSortScore" }, { id: "wait", msg: "dashboard.ideasSortWait" }, { id: "upside", msg: "dashboard.ideasSortUpside" }, { id: "title", msg: "dashboard.sortAZ" },
];
// In the order the facet lists them; the first one is the status that waits on a decision.
const STATUSES = Object.keys({ "Awaiting decision": 0, "In trial": 0, Building: 0, Unfunded: 0, Shipped: 0 } satisfies Record<IdeaStatus, 0>) as IdeaStatus[];
const AWAITING = STATUSES[0];

export function IdeasView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { seed, S, demo, role, persona, act, openSheet, showToast, q, setQ, href, ready, f } = ctx;
  const t = useT();
  const locale = useLocale();
  const [iid, setIid] = useState<string | null>(initialId ?? null);
  const [sort, setSort] = useState<IdeaSort>("score");
  const [status, setStatus] = useState("All");
  if (!ready) return <PageSkeleton kind="list" delay />;

  const isEmployee = role === "member";
  const toks = tokens(q), hasQuery = toks.length > 0;
  const scope = scopedIdeas(ctx);
  const searched = scope.filter((i) => !hasQuery || hits(ideaHay(i, S.problems, seed.depts), toks));
  const pool = searched.filter((i) => status === "All" || i.status === status);
  const sorted = sortIdeas(pool, sort);
  const si = sorted.find((i) => i.id === iid) ?? sorted[0] ?? null;
  const sip = si ? problemOf(ctx, si) : undefined;

  const filterCount = status !== "All" ? 1 : 0;
  const filtered = (filterCount > 0 || hasQuery) && scope.length > 0;
  const showing = t("dashboard.ideasShowing", { n: sorted.length, total: scope.length });
  const facets = [{ key: "status", label: t("dashboard.ideasFacetStatus"), value: status, onSel: setStatus,
    options: [{ id: "All", label: t("dashboard.listAll"), count: searched.length }].concat(STATUSES.map((s) => ({ id: s, label: wordText(t, s), count: searched.filter((i) => i.status === s).length }))) }];
  const chips: Chip[] = [];
  if (hasQuery) chips.push({ label: t("dashboard.chipQuery", { q: q.trim() }), onRemove: () => setQ("") });
  if (status !== "All") chips.push({ label: wordText(t, status), onRemove: () => setStatus("All") });
  const clearAll = () => { setQ(""); setStatus("All"); };

  const decidable = si?.status === AWAITING, fundable = si?.status === "Unfunded";
  const cosigned = !!si && si.cosigners.some((x) => x.name === persona.who.handle);
  const primaryLabel = t(isEmployee ? (cosigned ? "dashboard.ideasCosigned" : "dashboard.ideasCosign") : decidable ? "dashboard.ideasApproveAssign" : fundable ? "dashboard.ideasFundTrial" : "dashboard.ideasOpenTrial");
  const onPrimary = () => {
    if (!si) return;
    if (isEmployee) { const added = act.cosign(si.id); showToast(added ? t("dashboard.ideasYouCosigned", { title: si.title }) : t("dashboard.ideasCosignWithdrawn", { title: si.title })); }
    else if (decidable || fundable) openSheet("assign", si.id, { people: si.team.filter((n) => n !== "—" && n !== "Anonymous") });
    else showToast(t("dashboard.ideasOpened", { title: si.title }));
  };
  const emptySub = filtered ? t("dashboard.ideasEmptyFiltered")
    : demo ? t("dashboard.ideasEmptyDemo") : t("dashboard.ideasEmptyLive");

  return (
    <>
      <ViewHead view="ideas"
        tools={<ListTools sort={sort} sortOptions={SORTS.map((o) => ({ id: o.id, label: t(o.msg) }))} onSort={(id) => setSort(id as IdeaSort)} facets={facets} filterCount={filterCount} onClearFilters={() => setStatus("All")} showingLabel={showing} />}
        strip={filtered ? <FilterStrip showingLabel={showing} chips={chips} onClearAll={clearAll} /> : undefined} />
      <div className={ui.split}>
        <div className={`${ui.card} ${ui.cardList}`}>
          {sorted.length === 0 && (
            <Empty title={filtered ? t("dashboard.ideasNoMatch") : t("dashboard.ideasNone")} sub={emptySub}>
              {filtered && <button type="button" className={ui.ghost} onClick={clearAll}>{t("dashboard.ideasClearSearch")}</button>}
            </Empty>
          )}
          <div className={ui.list}>
            {sorted.map((i) => (
              <div key={i.id} className={ui.row} data-active={si?.id === i.id ? "true" : undefined} onClick={() => setIid(i.id)}>
                <div className={ui.mark} />
                <div className={ui.rowBody}>
                  <div className={styles.rowTop}>
                    <div className={styles.rowMain}>
                      <div className={`${ui.chips} ${styles.criteria}`}>
                        {criteriaTags(i.criteria, locale).map((tag) => <Pill key={tag.label} tone={tag.none ? "none" : tag.strong ? "ink" : "soft"}>{tag.label}</Pill>)}
                      </div>
                      <div className={ui.rowTitle}>{i.title}</div>
                      <div className={ui.rowSub}>{t("dashboard.ideasSolves", { title: problemOf(ctx, i)?.title ?? "—" })}</div>
                    </div>
                    <div className={styles.rowRight}>
                      <Pill tone={statusTone(i.status)}>{wordText(t, i.status)}</Pill>
                      <span className={styles.effort}>{i.effort}</span>
                    </div>
                  </div>
                  <div className={`${ui.chips} ${styles.rowMeta}`}>
                    <span className={styles.expected}>{i.expected}</span>
                    <span className={ui.rowMeta}>{t("dashboard.ideasRaisedBy", { by: i.proposedBy })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${ui.card} ${ui.sticky}`}>
          <div className={ui.eyebrow}>{t("dashboard.ideasSelected")}</div>
          <div className={ui.h2}>{si ? si.title : t("dashboard.ideasNoneToShow")}</div>
          {si && (
            <div className={`${ui.chips} ${styles.selMeta}`}>
              <Pill tone={statusTone(si.status)}>{wordText(t, si.status)}</Pill>
              <span className={ui.small}>{si.wait ? t("dashboard.ideasWaiting", { n: si.wait }) : si.status === "Shipped" ? t("dashboard.ideasLive") : t("dashboard.ideasNoOwner")}</span>
            </div>
          )}
          <div className={`${ui.body} ${styles.rationale}`}>{si ? si.rationale : emptySub}</div>
          <div className={`${ui.grid2} ${styles.tiles}`}>
            <Tile v={si ? si.upside : "—"} l={t("dashboard.ideasUpsideYr")} />
            <Tile v={si ? si.effort : "—"} l={t("dashboard.ideasFindOut")} />
          </div>

          {si?.approved && (
            <div className={styles.approved}>
              {t(si.approved.funded ? "dashboard.ideasTrialFunded" : "dashboard.ideasApprovedBy", { date: f(si.approved.day), by: si.approved.by }) + (si.approved.note ? " " + t("dashboard.ideasApprovedNote", { note: si.approved.note }) : "")}
            </div>
          )}
          {si && si.cosigners.length > 0 && <div className={styles.cosign}>{t("dashboard.ideasCosigners", { count: si.cosigners.length })}</div>}
          <div className={`${ui.btnRow} ${ui.mt14}`}>
            {si ? (
              <Btn kind={(decidable || fundable) && !isEmployee ? "accent" : cosigned ? "muted" : "primary"} onClick={onPrimary}>{primaryLabel}</Btn>
            ) : (
              <Btn kind="disabled">{t("dashboard.ideasNothingToDecide")}</Btn>
            )}
            <Btn onClick={() => si && openSheet("askIdea", si.id)}>{t("dashboard.ideasAsk")}</Btn>
          </div>

          {si && si.thread.length > 0 && (
            <>
              <div className={`${ui.eyebrow} ${ui.mt20}`}>{t("dashboard.ideasQuestionsAsked")}</div>
              <div className={styles.thread}>
                {si.thread.map((q2, k) => (
                  <div key={k} className={ui.quote}>
                    <div className={ui.quoteText}>{t("dashboard.ideasQuote", { text: q2.text })}</div>
                    <div className={ui.quoteBy}>{t("dashboard.ideasNoAnswerYet", { by: q2.by, date: f(q2.day) })}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={`${ui.eyebrow} ${ui.mt20}`}>{t("dashboard.ideasProblemAnswers")}</div>
          {sip ? (
            <Link href={href("/problems?id=" + sip.id)} className={`${ui.tile} ${ui.tileClick} ${styles.problemTile}`}>
              <div className={ui.tileTitle}>{sip.title}</div>
              <div className={ui.tileSub}>{sip.sub}</div>
            </Link>
          ) : (
            <div className={`${ui.tile} ${styles.problemTile}`}><div className={ui.tileTitle}>—</div></div>
          )}

          <div className={`${ui.eyebrow} ${ui.mt20}`}>{t("dashboard.ideasWhoRuns")}</div>
          <div className={styles.team}>
            {(si?.team ?? []).map((n) => (
              <span key={n} className={ui.personChip}><Avatar name={n} size="sm" />{n === "—" ? t("dashboard.listNobodyAssigned") : n}</span>
            ))}
          </div>
          <div className={`${ui.note} ${styles.teamNote}`}>{si?.teamNote ?? ""}</div>
        </div>
      </div>
    </>
  );
}
