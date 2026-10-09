"use client";
// The Feed: the Claude Design handoff "Idea Feed", its markup and classes 1:1 (dc-convert ->
// Feed.module.css). Closed, a grid of cards - a cover with the case's key number, the title, who
// backs it - filtered by site and department and sorted by support or age. A card opens the idea in
// place: the case, its five score dials, what the AI found, and on the right Support and comments.
// Escape closes it, ↑/↓ step through the filtered list. ?id= opens one straight away.
// Facts: the cases this viewer may see (derive.visibleTo), "this affects me too" as Support
// (act.affect), comments (act.comment). Covers come from a fixed library (features/cases/thumbs.ts);
// likes and replies are stand-ins (feedPreview).
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { canOpen, visibleTo } from "@/components/dashboard/derive";
import { initialsOf } from "@/components/dashboard/leader/IdeaParts";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { FEED_SORT_LABEL, feedCover, feedStage, inDept, sortFeed, supportLine, supportReasons, type FeedSort } from "@/features/cases/feed";
import type { ReducedCase } from "@/features/cases/reducer";
import { dashboardRow, overviewSteps, raisedWith } from "@/features/cases/rows";
import { affectedOn, commentsOn, onDesk, rescoresOn } from "@/features/cases/selectors";
import { briefForCase, tagTone, type IdeaBrief } from "@/features/ideas/brief";
import { profileOf } from "@/features/demo/profiles";
import s from "./Feed.module.css";
import { useFeedPreview } from "./feedPreview";
import { libraryCoverFor, sampleCoverFor } from "@/features/cases/thumbs";

const ALL_SITES = "All sites";
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
const isHandle = (name: string) => name.startsWith("Anonymous");
const ago = (days: number) => (days <= 0 ? "Today" : days === 1 ? "Yesterday" : days + " d ago");

function UpArrow({ size, w }: { size: number; w: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
}
function Check({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
function Thumb() {
  return <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 10v11H4V10h3zM7 10l4-8a2.5 2.5 0 012.5 2.5V9h5.6a2 2 0 012 2.3l-1.4 8A2 2 0 0117.7 21H7" /></svg>;
}

// One case as the Feed needs it: facts from the log, nothing invented.
type Item = {
  c: ReducedCase; mine: boolean; supporters: string[]; supported: boolean; tags: string[];
  site: string | null; raisedDay: number; backers: number; comments: number;
};

export function FeedView({ initialId }: { initialId?: string } = {}) {
  const ctx = useDemo();
  const { seed, D, log, persona, ready, act, actor, f, motion } = ctx;
  const [dept, setDept] = useState("All");
  const [site, setSite] = useState(ALL_SITES);
  const [sort, setSort] = useState<FeedSort>("support");
  const [menu, setMenu] = useState<"site" | "sort" | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const [openScore, setOpenScore] = useState<Record<string, number | null>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, string | null>>({}); // case id -> comment id
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useFeedPreview();

  const P = seed.promiseDays;
  const briefCtx = { people: seed.people, depts: seed.depts, ideas: seed.ideas };
  const deptNames = seed.depts.map((d) => d.name);
  const personOf = (name: string) => seed.people.find((p) => p.name === name);
  const deptNameOf = (name: string) => { const id = personOf(name)?.dept; return seed.depts.find((d) => d.id === id)?.name ?? ""; };
  const roleOf = (name: string) => personOf(name)?.role ?? "";
  const siteOf = (name: string) => (isHandle(name) ? null : profileOf(name).location);
  const top = () => rootRef.current?.scrollIntoView({ block: "start", behavior: motion ? "smooth" : "auto" });

  const itemOf = (c: ReducedCase): Item => {
    const row = dashboardRow(c, P, persona.who, log);
    const supporters = row.affected.filter((n) => !deptNames.includes(n));
    const routeDept = c.route ? seed.depts.find((d) => d.id === c.route?.owner.dept)?.name ?? null : null;
    const tags = [...new Set([c.fromDept, ...(routeDept ? [routeDept] : []), ...row.affected.filter((n) => deptNames.includes(n))])];
    return {
      c, mine: row.mine, supporters, supported: supporters.includes(actor) || affectedOn(log, c.id).some((a) => a.name === actor), tags,
      site: siteOf(c.from), raisedDay: c.raisedDay, backers: supporters.length, comments: commentsOn(log, c.id).filter((m) => !m.rescore).length,
    };
  };
  const visible = D.cases.filter((c) => visibleTo(ctx, c)).map(itemOf);
  const bySite = visible.filter((x) => site === ALL_SITES || x.site === site);
  const list = sortFeed(bySite.filter((x) => inDept(x.tags, dept)), sort);
  const sites = [ALL_SITES, ...[...new Set(visible.map((x) => x.site).filter((x): x is string => !!x))].sort()];
  const chips = ["All", ...deptNames];


  const open = (id: string) => { setOpenId(id); top(); };
  const support = (x: Item) => {
    const added = act.affect(x.c.id);
    preview.setReason(x.c.id, added ? "ask" : "done");
  };
  // Supporter avatars: up to three, you first once you back it.
  const avatars = (x: Item) => (x.supported ? [actor, ...x.supporters.filter((n) => n !== actor)] : x.supporters).slice(0, 3);

  // ── the opened idea ──
  const openIdx = list.findIndex((x) => x.c.id === openId);
  const deskOnly = !openId || openIdx >= 0 ? null : D.cases.find((k) => k.id === openId && canOpen(ctx, k));
  const current = openIdx >= 0 ? list[openIdx] : deskOnly ? itemOf(deskOnly) : null;
  const close = () => { setOpenId(null); top(); };
  const go = (dir: number) => { if (openIdx < 0 || !list.length) return; setOpenId(list[(openIdx + dir + list.length) % list.length].c.id); top(); };

  // Escape closes the open menu, else the open idea; ↑/↓ step through the list (inputs keep their keys).
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape" && menu) { setMenu(null); return; }
    if (!openId || isTyping(e.target)) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(-1); }
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!ready) return <PageSkeleton kind="dashboard" delay />;

  if (current) {
    const { c } = current;
    const raised = raisedWith(c);
    const row = dashboardRow(c, P, persona.who, log);
    const brief = briefForCase(c, briefCtx, {
      promiseDays: P, me: current.mine ? c.from : persona.who.name, affected: row.affected, attachments: raised.attachments, updates: rescoresOn(log, c.id).length,
      passTo: "", history: "", side: onDesk(c, persona.who.name) && !current.mine ? "desk" : "raiser",
    });
    return (
      <div className={s.root} ref={rootRef}>
        <div className={s.div3}>
          {renderOpen(current, brief, overviewSteps(c, f, current.mine))}
        </div>
      </div>
    );
  }

  return (
    <div className={s.root} ref={rootRef}>
      <div className={s.div3}>
        <div className={s.div4}>
          <h1 className={s.feed}>Feed</h1>
          <div className={s.div5}>
            {menu && <div className={s.closeMenu} onClick={() => setMenu(null)} aria-hidden="true" />}
            <div className={s.div6}>
              <button type="button" className={s.toggleSite} onClick={() => setMenu(menu === "site" ? null : "site")} aria-expanded={menu === "site"} aria-haspopup="menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                {site}
              </button>
              {menu === "site" && (
                <div className={s.div7} role="menu">
                  {sites.map((x) => (
                    <button key={x} type="button" role="menuitemradio" aria-checked={site === x} className={s.pick} data-on={site === x ? "true" : undefined} onClick={() => { setSite(x); setMenu(null); }}>
                      <span className={s.label}>{x}</span>
                      <span className={s.count}>{x === ALL_SITES ? visible.length : visible.filter((v) => v.site === x).length}</span>
                      <span className={s.check}>{site === x ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className={s.div6}>
              <button type="button" className={s.toggleSort} onClick={() => setMenu(menu === "sort" ? null : "sort")} aria-expanded={menu === "sort"} aria-haspopup="menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></svg>
                {FEED_SORT_LABEL[sort]}
              </button>
              {menu === "sort" && (
                <div className={s.div7} role="menu">
                  {(["support", "newest"] as const).map((k) => (
                    <button key={k} type="button" role="menuitemradio" aria-checked={sort === k} className={s.pick} data-on={sort === k ? "true" : undefined} onClick={() => { setSort(k); setMenu(null); }}>
                      <span className={s.label}>{FEED_SORT_LABEL[k]}</span>
                      <span className={s.check}>{sort === k ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={s.div8}>
          {chips.map((d) => (
            <button key={d} type="button" className={s.pick2} data-on={dept === d ? "true" : undefined} aria-pressed={dept === d} onClick={() => setDept(d)}>
              {d}<span className={s.count2}>{d === "All" ? bySite.length : bySite.filter((x) => x.tags.includes(d)).length}</span>
            </button>
          ))}
        </div>

        <div className={s.div9}>
          {list.map((x, k) => {
            const { c } = x, st = feedStage(c);
            // Until covers are generated per idea (docs/AI_COVERS.md): the sample idea's own picture and
            // text, else a library picture with its text (features/cases/thumbs.ts).
            const pic = sampleCoverFor(c) ?? libraryCoverFor(c.id);
            const own = pic ?? feedCover(c, x.supporters.length);
            const cover = { stat: own.stat, hook: own.hook, image: pic?.src ?? null, fit: pic?.fit ?? 1 };
            return (
              <div key={c.id} className={s.open} role="link" tabIndex={0} data-screen-label="Feed card" style={{ animationDelay: k * 70 + "ms" }}
                onClick={() => open(c.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(c.id); }}>
                <div className={s.aiImg}>
                  {cover.image && cover.fit > 0 && (
                    // eslint-disable-next-line @next/next/no-img-element -- a fixed 16:9 cover, placed by Step 3 (scale + mask)
                    <img src={cover.image} alt="" className={s.coverImg} loading="lazy" data-placed={cover.fit < 1 ? "true" : undefined}
                      style={cover.fit < 1 ? ({ "--fit": cover.fit } as React.CSSProperties) : undefined} />
                  )}
                  <div className={s.scrim} aria-hidden="true" />
                  <div className={s.div10}>
                    <span className={s.initials}>{initialsOf(c.from)}</span>
                    <div className={s.div11}>
                      <span className={s.author}>{c.from}</span>
                      <span className={s.dept}>{[c.fromDept, x.site, ago(log.day - c.raisedDay)].filter(Boolean).join(" · ")}</span>
                    </div>
                    <span className={s.stage} data-tone={st.tone}>{st.label}</span>
                  </div>
                  <div className={s.div12}>
                    <div className={s.div13}>
                      <span className={s.coverStat} data-long={cover.stat.length >= 7 ? "true" : undefined}>{cover.stat}</span>
                      {cover.hook && <span className={s.coverHook}>{cover.hook}</span>}
                    </div>
                  </div>
                </div>
                <h3 className={s.title}>{c.title}</h3>
                <div className={s.div14}>
                  <div className={s.div15}>
                    {avatars(x).map((n) => <span key={n} className={s.ini} data-me={n === actor ? "true" : undefined}>{initialsOf(n)}</span>)}
                  </div>
                  <button type="button" className={s.toggleSupport} data-on={x.supported ? "true" : undefined} aria-pressed={x.supported}
                    onClick={(e) => { e.stopPropagation(); support(x); }}>
                    {x.supported ? <Check size={13} /> : <UpArrow size={13} w={2.6} />}{x.supported ? "Supported" : "Support"}<span className={s.supCount}>{x.supporters.length + (x.supported && !x.supporters.includes(actor) ? 1 : 0)}</span>
                  </button>
                  <span className={s.commentCount}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg>
                    {x.comments}
                  </span>
                  <span className={s.label} />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </div>
              </div>
            );
          })}
        </div>
        {!list.length && <div className={s.div16}>{visible.length ? "No ideas match these filters." : "Nothing in the feed yet."}</div>}
      </div>
    </div>
  );

  // The opened idea: left the case, its dials and what the AI found; right Support and comments.
  function renderOpen(item: Item, brief: IdeaBrief, steps: ReturnType<typeof overviewSteps>) {
    const { c } = item, st = feedStage(c);
    const os = openScore[c.id] ?? null;
    const dial = os !== null ? brief.scores[os] : null;
    const cs = commentsOn(log, c.id).filter((m) => !m.rescore);
    const nReplies = cs.reduce((n, m) => n + (preview.replies[m.id]?.length ?? 0), 0);
    const draft = drafts[c.id] ?? "";
    const rt = replyTo[c.id] ?? null;
    const rc = rt ? cs.find((m) => m.id === rt) ?? null : null;
    const nameOf = (by: string) => (by === actor ? "You" : by);
    const count = item.supporters.length + (item.supported && !item.supporters.includes(actor) ? 1 : 0);
    const names = item.supported && !item.supporters.includes(actor) ? [actor, ...item.supporters] : item.supporters;
    const myDept = deptNameOf(persona.who.name);
    const fromMine = names.filter((n) => n !== actor && deptNameOf(n) === myDept).length + (item.supported ? 1 : 0);
    const iTalked = cs.some((m) => m.by === actor) || cs.some((m) => preview.replies[m.id]?.length);
    const iLiked = cs.some((m) => preview.likes[m.id]);
    const anon = isHandle(c.from);
    const role = anon ? c.fromDept : roleOf(c.from) || c.fromDept;
    const send = () => {
      const t = draft.trim();
      if (!t) return;
      if (rc) preview.reply(rc.id, { text: t, day: log.day });
      else act.comment(c.id, t);
      setDrafts((d) => ({ ...d, [c.id]: "" }));
      setReplyTo((r) => ({ ...r, [c.id]: null }));
    };
    const splitBlock = dial?.blocks.find((b) => b.t === "split");
    return (
      <article className={s.article} data-screen-label="Feed post">
        <div className={s.div17}>
          <div className={s.div18}>
            <div className={s.div19}>
              <span className={s.initials2}>{initialsOf(c.from)}</span>
              <div className={s.div11}>
                <span className={s.author2}>{c.from}</span>
                <span className={s.role}>{[role, item.site, "raised " + f(c.raisedDay)].filter(Boolean).join(" · ")}</span>
              </div>
              <span className={s.stage} data-tone={st.tone}>{st.label}</span>
              <button type="button" className={s.closeIdea} onClick={() => close()} title="Close" aria-label="Close">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <span className={s.kind}>{c.kind === "idea" ? "Idea" : "Problem"}</span>
            <h2 className={s.title2}>{c.title}</h2>
            <p className={`${s.desc} ${s.ctxText}`}>{brief.description}</p>
            {(brief.depts.length > 0 || brief.people.length > 0) && (
              <div className={s.div20}>
                <span className={s.affects}>Affects</span>
                <div className={s.div8}>
                  {brief.depts.map((d) => <span key={d.id} className={s.a}>{d.name}</span>)}
                  {brief.people.map((p) => <span key={p.name} className={s.name}><span className={s.ini2}>{initialsOf(p.name)}</span>{p.name}</span>)}
                </div>
              </div>
            )}
            {brief.context && (
              <div className={s.div21}>
                <span className={s.affects}>Context</span>
                <p className={`${s.context} ${s.ctxText}`}>{brief.context}</p>
              </div>
            )}
            {brief.prompts.length > 0 && (
              <div className={s.div22}>
                {brief.prompts.map((pr) => <PromptRow key={pr.label} label={pr.label} text={pr.text} />)}
              </div>
            )}
            {brief.files.length > 0 && (
              <div className={s.div20}>
                <span className={s.affects}>Attachments</span>
                <div className={s.div23}>
                  {brief.files.map((x) => (
                    <span key={x.name} className={s.a2} title={x.name}>
                      <span className={s.ext} data-tone={tagTone(x.ext)}>{x.ext.slice(0, 4)}</span>
                      <span className={s.span}><span className={s.name2}>{x.short}</span><span className={s.size}>{x.size}</span></span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={s.div24}>
            <div className={s.div25}>
              <div className={s.div26}>
                {brief.scores.map((sc, i) => {
                  const on = os === i;
                  return (
                    <div key={sc.label} className={s.div27} data-open={on ? "true" : undefined}>
                      <span className={s.label3}>{sc.label}</span>
                      <div className={s.div28}>
                        <svg className={s.svg} viewBox="0 0 72 72" aria-hidden="true">
                          <circle cx="36" cy="36" r="30" fill="none" stroke="#e3eaf7" strokeWidth="10" strokeLinecap="round" strokeDasharray="141.4 188.5" />
                          <circle cx="36" cy="36" r="30" fill="none" stroke="#007aff" strokeWidth="10" strokeLinecap="round" strokeDasharray={((sc.value / 100) * 141.4).toFixed(1) + " 188.5"} />
                        </svg>
                        <div className={s.div29}><span className={s.v}>{sc.value}</span><span className={s.n100}>/ 100</span></div>
                        <button type="button" className={s.toggle} title="Show reasoning" aria-label={(on ? "Hide" : "Show") + " the reasoning for " + sc.label} aria-expanded={on}
                          onClick={() => setOpenScore((m) => ({ ...m, [c.id]: on ? null : i }))}>
                          <svg className={s.svg2} data-open={on ? "true" : undefined} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </div>
                      {on && (
                        <>
                          <div className={s.div30} />
                          {i > 0 && <div className={s.div31} />}
                          {i < brief.scores.length - 1 && <div className={s.div32} />}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={s.div33} data-open={os !== null ? String(os) : undefined}>
            {dial ? (
              <div className={s.div34}>
                <div className={s.div35}>
                  <span className={s.affects}>{dial.label}</span>
                  <p className={s.note}>{dial.note}</p>
                </div>
                {splitBlock && splitBlock.t === "split" ? (
                  <div className={s.div36}>
                    <div className={s.div35}><span className={s.affects}>Pulling it up</span>{splitBlock.ups.map((u) => <p key={u.t} className={s.context}>{u.t}</p>)}</div>
                    <div className={s.div35}><span className={s.affects}>Holding it back</span>{splitBlock.downs.map((u) => <p key={u.t} className={s.context}>{u.t}</p>)}</div>
                  </div>
                ) : dial.blocks.map((b, bi) => b.t === "facts" ? (
                  <div key={bi} className={s.div22}>{b.items.map((it) => <PromptRow key={it.k} label={it.k} text={it.v} />)}</div>
                ) : b.t === "text" ? (
                  <div key={bi} className={s.div35}><span className={s.affects}>{b.h}</span><p className={s.context}>{b.p}</p></div>
                ) : null)}
              </div>
            ) : (
              <div className={s.div34}>
                <div className={s.div5}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="#007aff" /></svg>
                  <span className={s.span2}>What the AI found</span>
                </div>
                <div className={s.div37}>
                  <p className={s.note}>{brief.summary}</p>
                  {brief.lead && <p className={s.context}>{brief.lead}</p>}
                </div>
                {brief.bars && (
                  <div className={s.div38}>
                    <span className={s.affects}>{brief.bars.title}</span>
                    {brief.bars.rows.map((r) => (
                      <div key={r.label} className={s.div39}>
                        <span className={s.label4}>{r.label}</span>
                        <div className={s.div40}><div className={s.div41} style={{ width: r.pct + "%" }} /></div>
                        <span className={s.d}>{r.display}</span>
                      </div>
                    ))}
                    <span className={s.barsNote}>{brief.bars.note}</span>
                  </div>
                )}
                {brief.after && <p className={s.context}>{brief.after}</p>}
                <div className={s.div22}>
                  {brief.rec && <><span className={s.label2}>Advice</span><span className={s.advice}>{brief.actions.find((a) => a.key === brief.rec)?.label}</span></>}
                  <PromptRow label="Why" text={brief.recText} />
                  {brief.next && <PromptRow label="Next step" text={brief.next} />}
                  {brief.by && <PromptRow label="Decision by" text={brief.by} />}
                </div>
                <div className={s.div42}>
                  <span className={s.affects}>Where it stands</span>
                  <div className={s.div43}>
                    {steps.map((t) => (
                      <div key={t.label} className={s.div44}>
                        <div className={s.div45} data-on={t.tone !== "todo" ? "true" : undefined} />
                        <span className={s.when}>{t.label}</span>
                        <span className={s.what}>{t.sub || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={s.span}>
          <div className={s.div46}>
            <div className={s.div47}>
              <div className={s.div19}>
                <div className={s.div15}>
                  {avatars(item).map((n) => <span key={n} className={s.ini3} data-me={n === actor ? "true" : undefined}>{initialsOf(n)}</span>)}
                </div>
                <span className={s.div11}>
                  <span className={s.supLine}>{supportLine(names, actor)}</span>
                  {myDept && fromMine > 0 && <span className={s.size}>{fromMine + " from " + myDept + (item.supported ? ", including you" : " back this")}</span>}
                </span>
              </div>
              <button type="button" className={s.toggleSupport2} data-on={item.supported ? "true" : undefined} aria-pressed={item.supported} onClick={() => support(item)}>
                {item.supported
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  : <UpArrow size={18} w={2.8} />}
                {item.supported ? "You support this" : "Support this " + (c.kind === "idea" ? "idea" : "problem")}
              </button>
              <span className={s.mood}>{count ? brief.feed.sentiment : "Be the first to back it."}</span>
              {item.supported && preview.reasons[c.id] === "ask" && (
                <div className={s.div48}>
                  <span className={s.affects}>Tell {anon ? "them" : c.from} why, in one tap</span>
                  <div className={s.div8}>
                    {supportReasons(c.kind).map((t) => (
                      <button key={t} type="button" className={s.pick3} onClick={() => { act.comment(c.id, t + "."); preview.setReason(c.id, "done"); }}>{t}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className={s.div49}>
              <span className={s.comments}>Comments</span>
              <span className={s.affects}>{cs.length + nReplies}</span>
            </div>
            <div className={s.div50}>
              {!cs.length && <span className={s.span3}>No comments yet. Be the first.</span>}
              {cs.map((m) => {
                const liked = !!preview.likes[m.id];
                return (
                  <div key={m.id} className={s.div51}>
                    <div className={s.div52}>
                      <span className={s.ini4} data-mine={m.by === actor ? "true" : undefined}>{initialsOf(m.by)}</span>
                      <div className={s.div53}>
                        <div className={s.div54}>
                          <span className={s.name3}>{nameOf(m.by)}</span>
                          <span className={s.role2}>{[m.by === actor ? "" : roleOf(m.by) || deptNameOf(m.by), f(m.day)].filter(Boolean).join(" · ")}</span>
                        </div>
                        <p className={s.text2}>{m.text}</p>
                        <div className={s.div55}>
                          <button type="button" className={s.up} data-on={liked ? "true" : undefined} aria-pressed={liked} title="Like" onClick={() => preview.like(m.id)}>
                            <Thumb />{liked ? 1 : ""}
                          </button>
                          <button type="button" className={s.onReply} data-on={rt === m.id ? "true" : undefined}
                            onClick={() => { setReplyTo((r) => ({ ...r, [c.id]: m.id })); setTimeout(() => inputRef.current?.focus(), 0); }}>Reply</button>
                        </div>
                      </div>
                    </div>
                    {(preview.replies[m.id] ?? []).map((r, ri) => {
                      const k = m.id + ":" + ri, rl = !!preview.likes[k];
                      return (
                        <div key={k} className={s.div56}>
                          <span className={s.ini5} data-mine="true">{initialsOf(actor)}</span>
                          <div className={s.div53}>
                            <div className={s.div54}><span className={s.name3}>You</span><span className={s.role2}>{f(r.day)}</span></div>
                            <p className={s.text2}>{r.text}</p>
                            <div className={s.div55}>
                              <button type="button" className={s.up} data-on={rl ? "true" : undefined} aria-pressed={rl} title="Like" onClick={() => preview.like(k)}><Thumb />{rl ? 1 : ""}</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className={s.div57}>
              {!item.supported && (iTalked || iLiked) && (
                <div className={s.div58}>
                  <span className={s.nudgeText}>{iTalked ? "You joined the discussion. Back the idea too?" : "Agree with what people are saying? Add your support."}</span>
                  <button type="button" className={s.toggleSupport3} onClick={() => support(item)}><UpArrow size={12} w={3} />Support</button>
                </div>
              )}
              {rc && (
                <div className={s.div59}>
                  <span className={s.replyingTo}>Replying to<span className={s.replyName}>{nameOf(rc.by)}</span></span>
                  <button type="button" className={s.cancelReply} onClick={() => setReplyTo((r) => ({ ...r, [c.id]: null }))} title="Cancel reply" aria-label="Cancel reply">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              )}
              <div className={s.div60}>
                <input ref={inputRef} className={s.input} value={draft} placeholder={rc ? "Reply to " + nameOf(rc.by) : "Add a comment"} aria-label={rc ? "Reply to " + nameOf(rc.by) : "Add a comment"}
                  onChange={(e) => { const v = e.target.value; setDrafts((d) => ({ ...d, [c.id]: v })); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } else if (e.key === "Escape") setReplyTo((r) => ({ ...r, [c.id]: null })); }} />
                <button type="button" className={s.send} data-live={draft.trim() ? "true" : undefined} onClick={send} title="Send" aria-label="Send">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }
}

function PromptRow({ label, text }: { label: string; text: string }) {
  return <><span className={s.label2}>{label}</span><span className={s.text}>{text}</span></>;
}
