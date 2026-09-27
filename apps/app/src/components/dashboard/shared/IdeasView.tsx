"use client";
// Ideas from the organisation, each tagged on the three case criteria. Employees co-sign;
// managers approve (and assign) or fund a trial; anyone can ask a question under it.
// Port of the IDEAS block in legacy/demo/index.html.
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { criteriaTags, problemOf, scopedIdeas, sortIdeas, type IdeaSort } from "@/components/dashboard/derive";
import { Avatar, Btn, Empty, Pill, Tile, statusTone } from "@/components/dashboard/shared/primitives";
import { FilterStrip, ListTools, ViewHead, type Chip } from "@/components/dashboard/shared/ViewHead";
import type { IdeaStatus } from "@/features/demo/types";
import { hits, ideaHay, tokens } from "@/features/search";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./IdeasView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

const SORTS: { id: IdeaSort; label: string }[] = [
  { id: "score", label: "Most criteria met" }, { id: "wait", label: "Longest waiting" }, { id: "upside", label: "Biggest upside" }, { id: "title", label: "A → Z" },
];
const STATUSES: IdeaStatus[] = ["Awaiting decision", "In trial", "Building", "Unfunded", "Shipped"];

export function IdeasView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { seed, S, demo, role, persona, act, openSheet, showToast, q, setQ, href, ready, f } = ctx;
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
  const showing = "Showing " + sorted.length + " of " + scope.length + " ideas";
  const facets = [{ key: "status", label: "Status", value: status, onSel: setStatus,
    options: [{ id: "All", label: "All", count: searched.length }].concat(STATUSES.map((s) => ({ id: s, label: s, count: searched.filter((i) => i.status === s).length }))) }];
  const chips: Chip[] = [];
  if (hasQuery) chips.push({ label: "“" + q.trim() + "”", onRemove: () => setQ("") });
  if (status !== "All") chips.push({ label: status, onRemove: () => setStatus("All") });
  const clearAll = () => { setQ(""); setStatus("All"); };

  const decidable = si?.status === "Awaiting decision", fundable = si?.status === "Unfunded";
  const cosigned = !!si && si.cosigners.some((x) => x.name === persona.who.handle);
  const primaryLabel = isEmployee ? (cosigned ? "Co-signed ✓" : "Co-sign this idea") : decidable ? "Approve and assign" : fundable ? "Fund a trial" : "Open the trial";
  const onPrimary = () => {
    if (!si) return;
    if (isEmployee) { const added = act.cosign(si.id); showToast(added ? "You co-signed “" + si.title + "”. Credit follows your handle." : "Co-sign withdrawn from “" + si.title + "”."); }
    else if (decidable || fundable) openSheet("assign", si.id, { people: si.team.filter((n) => n !== "—" && n !== "Anonymous") });
    else showToast("Opened " + si.title + ".");
  };
  const emptySub = filtered ? "Try fewer words, or clear the search and filters to see everything in scope."
    : demo ? "No ideas are tied to problems in this department yet." : "Ideas appear here as step three of a case — once a problem exists, whoever raised it (or anyone else) can propose the fix.";

  return (
    <>
      <ViewHead view="ideas"
        tools={<ListTools sort={sort} sortOptions={SORTS} onSort={(id) => setSort(id as IdeaSort)} facets={facets} filterCount={filterCount} onClearFilters={() => setStatus("All")} showingLabel={showing} />}
        strip={filtered ? <FilterStrip showingLabel={showing} chips={chips} onClearAll={clearAll} /> : undefined} />
      <div className={ui.split}>
        <div className={`${ui.card} ${ui.cardList}`}>
          {sorted.length === 0 && (
            <Empty title={filtered ? "No ideas match" : "No ideas yet"} sub={emptySub}>
              {filtered && <button type="button" className={ui.ghost} onClick={clearAll}>Clear search and filters</button>}
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
                        {criteriaTags(i.criteria).map((t) => <Pill key={t.label} tone={t.none ? "none" : t.strong ? "ink" : "soft"}>{t.label}</Pill>)}
                      </div>
                      <div className={ui.rowTitle}>{i.title}</div>
                      <div className={ui.rowSub}>solves: {problemOf(ctx, i)?.title ?? "—"}</div>
                    </div>
                    <div className={styles.rowRight}>
                      <Pill tone={statusTone(i.status)}>{i.status}</Pill>
                      <span className={styles.effort}>{i.effort}</span>
                    </div>
                  </div>
                  <div className={`${ui.chips} ${styles.rowMeta}`}>
                    <span className={styles.expected}>{i.expected}</span>
                    <span className={ui.rowMeta}>· raised by {i.proposedBy}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${ui.card} ${ui.sticky}`}>
          <div className={ui.eyebrow}>Selected idea</div>
          <div className={ui.h2}>{si ? si.title : "No idea to show"}</div>
          {si && (
            <div className={`${ui.chips} ${styles.selMeta}`}>
              <Pill tone={statusTone(si.status)}>{si.status}</Pill>
              <span className={ui.small}>{si.wait ? "waiting " + si.wait + " days" : si.status === "Shipped" ? "live" : "no owner assigned"}</span>
            </div>
          )}
          <div className={`${ui.body} ${styles.rationale}`}>{si ? si.rationale : emptySub}</div>
          <div className={`${ui.grid2} ${styles.tiles}`}>
            <Tile v={si ? si.upside : "—"} l="expected upside / yr" />
            <Tile v={si ? si.effort : "—"} l="to find out if it works" />
          </div>

          {si?.approved && (
            <div className={styles.approved}>
              {(si.approved.funded ? "Trial funded " : "Approved ") + f(si.approved.day) + " by " + si.approved.by + (si.approved.note ? " — “" + si.approved.note + "”" : "")}
            </div>
          )}
          {si && si.cosigners.length > 0 && <div className={styles.cosign}>{si.cosigners.length + (si.cosigners.length === 1 ? " co-signer" : " co-signers")} from the organisation</div>}
          <div className={`${ui.btnRow} ${ui.mt14}`}>
            {si ? (
              <Btn kind={(decidable || fundable) && !isEmployee ? "accent" : cosigned ? "muted" : "primary"} onClick={onPrimary}>{primaryLabel}</Btn>
            ) : (
              <Btn kind="disabled">Nothing to decide</Btn>
            )}
            <Btn onClick={() => si && openSheet("askIdea", si.id)}>Ask a question</Btn>
          </div>

          {si && si.thread.length > 0 && (
            <>
              <div className={`${ui.eyebrow} ${ui.mt20}`}>Questions asked</div>
              <div className={styles.thread}>
                {si.thread.map((t, k) => (
                  <div key={k} className={ui.quote}>
                    <div className={ui.quoteText}>“{t.text}”</div>
                    <div className={ui.quoteBy}>{t.by} · {f(t.day)} · no answer yet</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={`${ui.eyebrow} ${ui.mt20}`}>Problem it answers</div>
          {sip ? (
            <Link href={href("/problems?id=" + sip.id)} className={`${ui.tile} ${ui.tileClick} ${styles.problemTile}`}>
              <div className={ui.tileTitle}>{sip.title}</div>
              <div className={ui.tileSub}>{sip.sub}</div>
            </Link>
          ) : (
            <div className={`${ui.tile} ${styles.problemTile}`}><div className={ui.tileTitle}>—</div></div>
          )}

          <div className={`${ui.eyebrow} ${ui.mt20}`}>Who would run it</div>
          <div className={styles.team}>
            {(si?.team ?? []).map((n) => (
              <span key={n} className={ui.personChip}><Avatar name={n} size="sm" />{n === "—" ? "Nobody assigned" : n}</span>
            ))}
          </div>
          <div className={`${ui.note} ${styles.teamNote}`}>{si?.teamNote ?? ""}</div>
        </div>
      </div>
    </>
  );
}
