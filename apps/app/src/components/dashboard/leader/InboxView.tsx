"use client";
// TEAM LEADER home: open items addressed to me, sorted by age, one action each - yes /
// no+why / hand over / ask one question. Port of the INBOX block in legacy/demo/index.html.
// A manager sees the same list with the ideas waiting on their decision on top.
// The stats strip, then the "Fresh ideas" card (Claude Design handoff): search,
// sort (oldest / newest first), filter (all / late / on time), one row per item - who sent it, what it
// is about, when it came in, the promise clock. Nothing is open until a row is picked; then the case
// sits beside the list and Close / Escape puts the page back.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { deskCases, inboxIdeas, inboxSorted, openCases, problemOf } from "@/components/dashboard/derive";
import { Avatar, Btn, Pill, reasonTone } from "@/components/dashboard/shared/primitives";
import { sentLabel } from "@/features/cases/rows";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./InboxView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

type Filter = "all" | "late" | "ontime";
const FILTERS: Filter[] = ["all", "late", "ontime"];
const FILTER_TITLE: Record<Filter, string> = { all: "Filter: all", late: "Filter: late only", ontime: "Filter: on time only" };
// Avatar backgrounds: the grey default and four muted accents, picked by name so a person keeps theirs.
const AVATAR_TONES = ["grey", "blue", "clay", "sage", "lilac"] as const;
const toneOf = (name: string) => AVATAR_TONES[[...name].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length];
const initialsOf = (name: string) => (name.startsWith("Anonymous") ? "?" : name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase());

export function InboxView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { seed, S, demo, persona, act, openSheet, showToast, ready, f, href } = ctx;
  // Selection: the page remounts this view (key = ?id) when a search result or link picks a case.
  const [cid, setCid] = useState<string | null>(initialId ?? null);
  const [query, setQuery] = useState("");
  const [newest, setNewest] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [now] = useState(() => new Date()); // views render only once `ready`, so this never meets the server render
  useEffect(() => {
    if (!cid) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCid(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cid]);
  if (!ready) return <PageSkeleton kind="inbox" delay />;

  const who = persona.who, P = seed.promiseDays;
  const desk = deskCases(ctx), open = openCases(ctx);
  const inbox = inboxSorted(ctx);
  const ideas = inboxIdeas(ctx);
  // The selection is an idea or a case - or nothing, until a row is picked.
  const si = ideas.find((i) => i.id === cid) ?? null;
  const sc = si ? null : inbox.find((c) => c.id === cid) ?? null;
  const route = sc?.route ?? null;
  const scMine = !!route && route.owner.name === who.name;
  const handTo = route ? (scMine ? route.deputy : route.owner.name) : "the triage desk";
  const lastHand = sc?.handed[sc.handed.length - 1];
  const handedNote = !sc ? ""
    : sc.escalated && sc.escalated.to === who.name && sc.assignee !== who.name
      ? "Escalated to you " + f(sc.escalated.day) + " — " + sc.assignee + " missed the " + P + "-day promise."
      : sc.escalated && sc.assignee === who.name
        ? "Past the promise since " + f(sc.escalated.day) + " — " + sc.escalated.to + " sees it too."
        : lastHand ? "From " + lastHand.from + ", " + f(lastHand.day) + (lastHand.why ? " — “" + lastHand.why + "”" : "") : "";

  const overdue = open.filter((c) => c.overdue).length + ideas.filter((i) => i.wait > P).length;
  const stats = [
    { v: String(desk.length + ideas.length), l: open.length === desk.length ? "on your desk" : "on your desk · " + (desk.length - open.length) + " paused" },
    { v: String(overdue), l: "past the " + P + "-day promise", hot: overdue > 0 },
    { v: demo ? seed.metrics.lead.medianAnswer : "—", l: "median time to answer" },
    { v: demo ? seed.metrics.lead.withinPromise : "—", l: "within the promise, Q3" },
  ];

  const sel = (c: (typeof inbox)[number]) => { if (c.read === null) act.read(c.id); setCid(c.id); };
  const picked = !!(si || sc);

  // A demo day offset (0 = today) as a date; a case raised today in this browser has its real time.
  const dayDate = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d; };
  const roleOf = (name: string, dept: string) => seed.people.find((p) => p.name === name)?.role ?? dept;

  // One row shape for ideas owed a decision and cases: who sent it, what it is about, when, the clock.
  const rows = [
    ...ideas.map((i) => {
      const [name, dept = ""] = i.proposedBy.split(", "); // "C. Ilg, Ops"
      return {
        id: i.id, title: i.title, name, role: roleOf(name, dept), solves: problemOf(ctx, i)?.title ?? "",
        sent: dayDate(-i.wait), exact: false, due: P - i.wait, paused: false, open: () => setCid(i.id),
      };
    }),
    ...inbox.map((c) => {
      const raised = c.history.find((e) => e.type === "case.raised" && !e.seed);
      const exact = !!raised && c.raisedDay === S.day;
      return {
        id: c.id, title: c.title, name: c.from, role: roleOf(c.from, c.fromDept), solves: c.body,
        sent: exact && raised ? new Date(raised.ts) : dayDate(c.raisedDay - S.day), exact, due: P - c.clock, paused: c.status === "asked", open: () => sel(c),
      };
    }),
  ];
  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => filter === "all" || (filter === "late" ? r.due < 0 : r.due >= 0))
    .filter((r) => !q || [r.title, r.name, r.role, r.solves].some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => (newest ? b.sent.getTime() - a.sent.getTime() : a.sent.getTime() - b.sent.getTime()));

  return (
    <div className={styles.page} data-picked={picked ? "true" : undefined}>
      <h1 className={styles.srOnly}>Inbox</h1>
      <div className={styles.top}>
        <div className={`${ui.stats} ${styles.stats}`}>
          {stats.map((k) => (
            <div key={k.l} className={`${ui.stat} ${styles.stat}`}>
              <div className={`${ui.statV} ${styles.statV}`} data-hot={k.hot ? "true" : undefined}>{k.v}</div>
              <div className={`${ui.statL} ${styles.statL}`}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.card} aria-label="Fresh ideas">
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Fresh ideas</h2>
            <div className={styles.tools}>
              <label className={styles.search}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search the inbox" />
              </label>
              <button type="button" className={styles.tool} onClick={() => setNewest((v) => !v)} title={newest ? "Sort: newest first" : "Sort: oldest first"} aria-label={newest ? "Sort: newest first" : "Sort: oldest first"}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></svg>
              </button>
              <button type="button" className={styles.tool} onClick={() => setFilter((v) => FILTERS[(FILTERS.indexOf(v) + 1) % FILTERS.length])} title={FILTER_TITLE[filter]} aria-label={FILTER_TITLE[filter]}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className={styles.empty}>Nothing is waiting on you.</div>
          ) : shown.length === 0 ? (
            <div className={styles.empty}>No ideas match.</div>
          ) : (
            <ul className={styles.list}>
              {shown.map((r) => (
                <li key={r.id}>
                  <button type="button" className={styles.row} onClick={r.open} data-active={cid === r.id ? "true" : undefined} aria-current={cid === r.id ? "true" : undefined}>
                    <span className={styles.avatar} data-tone={toneOf(r.name)} aria-hidden="true">{initialsOf(r.name)}</span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{r.title}</span>
                        <span className={styles.rowWho}>{r.name} <span className={styles.rowRole}>· {r.role}</span></span>
                        {r.solves && <span className={styles.rowSolves}>{r.solves}</span>}
                      </span>
                      <span className={styles.rowRight}>
                        <span className={styles.sent}>{sentLabel(r.sent, now, r.exact)}</span>
                        <span className={styles.badge} data-tone={r.paused ? "paused" : r.due < 0 ? "late" : "left"}>
                          {r.paused ? "paused" : r.due < 0 ? -r.due + " d late" : r.due + " d left"}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {picked && (
          <section className={`${styles.card} ${styles.detail}`} aria-label={si ? "Selected idea" : "Selected case"}>
            <div className={styles.detailHead}>
              <span className={styles.detailTag}>{si ? "Selected idea" : "Selected case"}</span>
              <button type="button" className={styles.close} onClick={() => setCid(null)} aria-label="Close">×</button>
            </div>
            <div className={styles.detailBody}>
              {si ? (
                <>
                  <div className={ui.h2}>{si.title}</div>
                  <div className={`${ui.chips} ${styles.selMeta}`}>
                    <Pill tone="accent">{si.status}</Pill>
                    <span className={ui.small}>waiting {si.wait} days</span>
                  </div>
                  <div className={`${ui.body} ${ui.mt14}`}>{si.rationale}</div>
                  <div className={`${ui.grid2} ${ui.mt14}`}>
                    <div className={ui.tile}><div className={ui.tileTitle}>{si.upside}</div><div className={ui.tileL}>expected upside / yr</div></div>
                    <div className={ui.tile}><div className={ui.tileTitle}>{si.effort}</div><div className={ui.tileL}>to find out if it works</div></div>
                  </div>
                  {si.blocker && <div className={styles.handedNote}>{si.blocker}</div>}
                  <div className={`${ui.eyebrow} ${styles.section}`}>Your move</div>
                  <div className={`${ui.btnRow} ${styles.actions}`}>
                    <Btn kind="accent" onClick={() => openSheet("assign", si.id, { people: si.team.filter((n) => n !== "—" && n !== "Anonymous") })}>Approve and assign</Btn>
                    <Btn onClick={() => openSheet("askIdea", si.id)}>Ask a question</Btn>
                  </div>
                  <div className={ui.mt14}><Link href={href("/ideas?id=" + si.id)} className={ui.textlink}>Open the idea →</Link></div>
                </>
              ) : sc && (
                <>
                  <div className={ui.h2}>{sc.title}</div>
                  <div className={`${ui.chips} ${styles.selMeta}`}>
                    <Pill tone={reasonTone(sc.reason)}>{sc.reason}</Pill>
                    <span className={ui.small}>{sc.clock} days open</span>
                  </div>
                  <div className={`${ui.quote} ${ui.mt14}`}>
                    <div className={ui.quoteText}>{sc.body}</div>
                    <div className={ui.quoteBy}><Avatar name={sc.from} size="sm" tone="color" /> {sc.from} · {sc.fromDept}</div>
                  </div>
                  <div className={`${ui.grid2} ${ui.mt14}`}>
                    <div className={ui.tile}><div className={ui.tileTitle}>{sc.upside || "not estimated yet"}</div><div className={ui.tileL}>what it is worth</div></div>
                    <div className={ui.tile}>
                      <div className={ui.tileTitle}>{!route ? "Nobody yet" : scMine ? "You" : route.owner.name}</div>
                      <div className={ui.tileL}>{!route ? "no map entry — you triage it" : scMine ? "owner on the map · deputy " + route.deputy : "owner on the map · " + route.type}</div>
                    </div>
                  </div>

                  {handedNote && <div className={styles.handedNote}>{handedNote}</div>}

                  {sc.question && (
                    <>
                      <div className={`${ui.eyebrow} ${styles.section}`}>Your question</div>
                      <div className={`${ui.quote} ${styles.q}`}>
                        <div className={ui.quoteText}>“{sc.question.text || "One question."}”</div>
                        <div className={ui.quoteBy}>you asked {f(sc.question.day)}</div>
                      </div>
                      {sc.question.answer && (
                        <div className={`${ui.quote} ${styles.a}`} data-tone="accent">
                          <div className={ui.quoteText}>“{sc.question.answer.text}”</div>
                          <div className={ui.quoteBy}>{sc.from} answered {f(sc.question.answer.day)}</div>
                        </div>
                      )}
                    </>
                  )}

                  {sc.status === "asked" && (
                    <div className={styles.pausedNote}>Waiting for {sc.from} to answer · clock paused at {sc.clock} d.</div>
                  )}

                  {sc.open && (
                    <>
                      <div className={`${ui.eyebrow} ${styles.section}`}>Your move</div>
                      <div className={`${ui.btnRow} ${styles.actions}`}>
                        <Btn kind="primary" onClick={() => { act.decide(sc.id, "yes"); showToast("Answered “yes” in " + sc.clock + " days. " + sc.from + " has been told."); }}>Yes, do it</Btn>
                        <Btn onClick={() => openSheet("no", sc.id)}>No, and why</Btn>
                      </div>
                      <div className={ui.btnRow}>
                        <Btn kind="accent" onClick={() => openSheet("hand", sc.id, { picked: handTo })}>{"Pass to " + handTo}</Btn>
                        <Btn onClick={() => openSheet("ask", sc.id)}>Ask a question</Btn>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
