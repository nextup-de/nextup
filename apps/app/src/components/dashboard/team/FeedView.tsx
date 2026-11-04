"use client";
// The Feed: the Claude Design handoff "Idea Feed", its markup and classes 1:1 (dc-convert ->
// Feed.module.css). Closed, a grid of cards - a cover with the case's key number, the title, who
// backs it - filtered by site and department and sorted by support or age. A card opens the idea in
// place: the case, its five score dials, what the AI found, and on the right Support and comments.
// Escape closes it, ↑/↓ step through the filtered list. ?id= opens one straight away.
// Facts: the cases this viewer may see (derive.visibleTo), "this affects me too" as Support
// (act.affect), comments (act.comment). Covers come from a fixed library (features/cases/thumbs.ts).
// Each card shows the case's latest event (features/cases/feed.ts latestActivity); nothing here is a stand-in.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useCaseNames } from "@/components/cases/useCaseNames";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { canOpen, visibleTo } from "@/components/dashboard/derive";
import { DeptChip, PersonFace } from "@/components/ui/elements";
import { deptTone } from "@/lib/dept-tone";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { ArchiveTabs } from "@/components/dashboard/shared/ArchiveTabs";
import { archiveOf, inView, type ArchiveFilter, type ListView } from "@/features/cases/discussion";
import { FEED_SORT_KEY, feedCover, feedStage, inDept, inSite, inUnit, latestActivity, siteFilters, sortFeed, isMe as isBacker, supportLine, supportSummary, unitFilters, type Activity, type Backer, type FeedSort } from "@/features/cases/feed";
import { MIN_GROUP } from "@/features/metrics/types";
import type { ReducedCase } from "@/features/cases/reducer";
import { dashboardRow, overviewSteps, raisedWith } from "@/features/cases/rows";
import { affectedOn, commentsOn, onDeskOf, rescoresOn } from "@/features/cases/selectors";
import { briefForCase, tagTone, type IdeaBrief } from "@/features/ideas/brief";
import { profileOf } from "@/features/demo/profiles";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n";
import s from "./Feed.module.css";
import { libraryCoverFor, sampleCoverFor } from "@/features/cases/thumbs";
import { useIdInUrl } from "@/lib/use-url-id";

const ALL_SITES = "*"; // the "every site" filter value; shown as feedAllSites
const ALL_UNITS = "*"; // the "every unit" filter value; shown as feed.allUnits
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
const isHandle = (name: string) => name.startsWith("Anonymous");
const ago = (t: T, days: number) => (days <= 0 ? t("common.today") : days === 1 ? t("common.yesterday") : t("team.feedDaysAgo", { count: days }));

function UpArrow({ size, w }: { size: number; w: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
}
function Check({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
// One case as the Feed needs it: facts from the log, nothing invented.
type Item = {
  c: ReducedCase; mine: boolean; backing: Backer[]; supported: boolean; tags: string[];
  site: string | null; raisedDay: number; lastDay: number; activity: Activity | null; backers: number; comments: number;
};

export function FeedView({ initialId }: { initialId?: string } = {}) {
  const t = useT();
  const names = useCaseNames();
  const ctx = useDemo();
  const { seed, tenant, D, log, ready, act, actor, me, f, motion, flag } = ctx; // actor is the label I post under: shown, never compared
  const isMe = (userId: string | null | undefined) => me.userId !== null && userId === me.userId;
  const [view, setView] = useState<ListView>("open");
  const [archived, setArchived] = useState<ArchiveFilter>("all");
  const [dept, setDept] = useState("All");
  const [site, setSite] = useState(ALL_SITES);
  const [unit, setUnit] = useState(ALL_UNITS);
  const [sort, setSort] = useState<FeedSort>("support");
  const [menu, setMenu] = useState<"site" | "unit" | "sort" | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  useIdInUrl(openId, setOpenId); // the opened card is in the address (?id=)
  const [openScore, setOpenScore] = useState<Record<string, number | null>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  const P = seed.promiseDays;
  const briefCtx = { people: seed.people, depts: seed.depts, ideas: seed.ideas, t };
  const deptNames = seed.depts.map((d) => d.name);
  const personOf = (name: string) => seed.people.find((p) => p.name === name);
  const deptNameOf = (name: string) => { const id = personOf(name)?.dept; return seed.depts.find((d) => d.id === id)?.name ?? ""; };
  const unitIdOf = (c: ReducedCase) => seed.depts.find((d) => d.name === c.fromDept)?.id ?? null;
  const roleOf = (name: string) => personOf(name)?.role ?? "";
  const siteOf = (name: string) => (isHandle(name) ? null : profileOf(name).location);
  const top = () => rootRef.current?.scrollIntoView({ block: "start", behavior: motion ? "smooth" : "auto" });

  const itemOf = (c: ReducedCase): Item => {
    const row = dashboardRow(c, P, me, log);
    const activity = latestActivity(c.id, log, seed.seats, tenant.actorLabels);
    // Who backs it: named when raised (no id), plus everyone who pressed "this affects me too" (their user id).
    const named = raisedWith(c).affected;
    const backing: Backer[] = [...named.map((name) => ({ userId: null, name })), ...affectedOn(log, c.id).filter((a) => !named.includes(a.name)).map((a) => ({ userId: a.userId, name: a.name }))]
      .filter((b) => !deptNames.includes(b.name));
    const routeDept = c.route ? seed.depts.find((d) => d.id === c.route?.owner.dept)?.name ?? null : null;
    const tags = [...new Set([c.fromDept, ...(routeDept ? [routeDept] : []), ...row.affected.filter((n) => deptNames.includes(n))])];
    return {
      c, mine: row.mine, backing, supported: backing.some((b) => isBacker(b, me)), tags,
      site: siteOf(c.from), raisedDay: c.raisedDay, lastDay: activity?.day ?? c.raisedDay, activity, backers: backing.length, comments: commentsOn(log, c.id).filter((m) => !m.rescore).length,
    };
  };
  // With projects on, the feed shows what is still moving; what was decided sits in the Archive.
  const split = flag("projects");
  const everything = D.cases.filter((c) => visibleTo(ctx, c)).map(itemOf);
  const visible = split ? everything.filter((x) => inView(archiveOf(x.c), view, archived)) : everything;
  const sites = siteFilters(seed), units = site === ALL_SITES ? [] : unitFilters(seed, site);
  const inSites = (x: Item, id: string) => id === ALL_SITES || inSite(seed, unitIdOf(x.c), id);
  const bySite = visible.filter((x) => inSites(x, site) && (unit === ALL_UNITS || inUnit(unitIdOf(x.c), unit)));
  const list = sortFeed(bySite.filter((x) => inDept(x.tags, dept)), sort);
  const siteName = sites.find((x) => x.id === site)?.name ?? t("team.feedAllSites");
  const unitName = units.find((x) => x.id === unit)?.name ?? t("feed.allUnits");
  const chips = ["All", ...deptNames];


  const open = (id: string) => { setOpenId(id); top(); };
  const support = (x: Item) => { act.affect(x.c.id); };
  // The latest-event line: what last happened, by whom (their desk role, else the event's label), and when.
  const latestLine = (c: ReducedCase, a: Activity | null): string => {
    const when = ago(t, log.day - (a?.day ?? c.raisedDay));
    if (!a || a.kind === "raised") return t("feed.latestRaised", { when });
    const who = (a.role ? names.roleTitle(a.role) : "") || a.label || t("feed.theDesk");
    const key = { read: "feed.latestRead", asked: "feed.latestAsked", yes: "feed.latestYes", no: "feed.latestNo", handed: "feed.latestHanded", discussion: "feed.latestDiscussion", escalated: "feed.latestEscalated" } as const;
    return t(key[a.kind], { who, when });
  };
  // The card's supporters line: a unit is named only with at least MIN_GROUP supporters from it.
  const supportersLine = (x: Item): string => {
    const sum = supportSummary(x.backing.map((b) => ({ ...b, unit: deptNameOf(b.name) || null })), me);
    return sum.kind === "none" ? t("feed.supportersNone") : sum.kind === "you" ? t("feed.supportersYou")
      : sum.kind === "unit" ? t("feed.supportersUnit", { count: sum.count, unit: sum.unit }) : t("feed.supportersCount", { count: sum.count });
  };
  // Supporter avatars: up to three, you first once you back it.
  const avatars = (x: Item) => (x.supported ? [{ name: actor, me: true }, ...x.backing.filter((b) => !isBacker(b, me)).map((b) => ({ name: b.name, me: false }))] : x.backing.map((b) => ({ name: b.name, me: false }))).slice(0, 3);

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
    const row = dashboardRow(c, P, me, log);
    const brief = briefForCase(c, briefCtx, {
      promiseDays: P, viewer: me, affected: row.affected, attachments: raised.attachments, updates: rescoresOn(log, c.id).length,
      passTo: "", history: "", side: onDeskOf(c, me) && !current.mine ? "desk" : "raiser",
    });
    return (
      <div className={s.root} ref={rootRef}>
        <div className={s.div3}>
          {renderOpen(current, brief, overviewSteps(c, f, current.mine, ctx.locale))}
        </div>
      </div>
    );
  }

  return (
    <div className={s.root} ref={rootRef}>
      <div className={s.div3}>
        <div className={s.div4}>
          <h1 className={s.feed}>{t("team.feedTitle")}</h1>
          <div className={s.div5}>
            {menu && <div className={s.closeMenu} onClick={() => setMenu(null)} aria-hidden="true" />}
            <div className={s.div6}>
              <button type="button" className={s.toggleSite} onClick={() => setMenu(menu === "site" ? null : "site")} aria-expanded={menu === "site"} aria-haspopup="menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                {siteName}
              </button>
              {menu === "site" && (
                <div className={s.div7} role="menu">
                  {[{ id: ALL_SITES, name: t("team.feedAllSites") }, ...sites].map((x) => (
                    <button key={x.id} type="button" role="menuitemradio" aria-checked={site === x.id} className={s.pick} data-on={site === x.id ? "true" : undefined} onClick={() => { setSite(x.id); setUnit(ALL_UNITS); setMenu(null); }}>
                      <span className={s.label}>{x.name}</span>
                      <span className={s.count}>{visible.filter((v) => inSites(v, x.id)).length}</span>
                      <span className={s.check}>{site === x.id ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {units.length > 0 && (
              <div className={s.div6}>
                <button type="button" className={s.toggleSite} onClick={() => setMenu(menu === "unit" ? null : "unit")} aria-expanded={menu === "unit"} aria-haspopup="menu">
                  {unitName}
                </button>
                {menu === "unit" && (
                  <div className={s.div7} role="menu">
                    {[{ id: ALL_UNITS, name: t("feed.allUnits") }, ...units].map((x) => (
                      <button key={x.id} type="button" role="menuitemradio" aria-checked={unit === x.id} className={s.pick} data-on={unit === x.id ? "true" : undefined} onClick={() => { setUnit(x.id); setMenu(null); }}>
                        <span className={s.label}>{x.name}</span>
                        <span className={s.count}>{visible.filter((v) => inSites(v, site) && (x.id === ALL_UNITS || inUnit(unitIdOf(v.c), x.id))).length}</span>
                        <span className={s.check}>{unit === x.id ? "✓" : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className={s.div6}>
              <button type="button" className={s.toggleSort} onClick={() => setMenu(menu === "sort" ? null : "sort")} aria-expanded={menu === "sort"} aria-haspopup="menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></svg>
                {t(FEED_SORT_KEY[sort])}
              </button>
              {menu === "sort" && (
                <div className={s.div7} role="menu">
                  {(["support", "latest"] as const).map((k) => (
                    <button key={k} type="button" role="menuitemradio" aria-checked={sort === k} className={s.pick} data-on={sort === k ? "true" : undefined} onClick={() => { setSort(k); setMenu(null); }}>
                      <span className={s.label}>{t(FEED_SORT_KEY[k])}</span>
                      <span className={s.check}>{sort === k ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {split && <ArchiveTabs view={view} filter={archived} outcomes={everything.map((x) => archiveOf(x.c))} onView={setView} onFilter={setArchived} />}

        <div className={s.div8}>
          {chips.map((d) => (
            <button key={d} type="button" className={s.pick2} data-dept-tone={d === "All" ? undefined : deptTone(d)} data-on={dept === d ? "true" : undefined} aria-pressed={dept === d} onClick={() => setDept(d)}>
              {d === "All" ? t("team.feedAll") : d}<span className={s.count2}>{d === "All" ? bySite.length : bySite.filter((x) => x.tags.includes(d)).length}</span>
            </button>
          ))}
        </div>

        <div className={s.div9}>
          {list.map((x, k) => {
            const { c } = x, st = feedStage(c, ctx.locale);
            // Until covers are generated per idea (docs/AI_COVERS.md): the sample idea's own picture and
            // text, else a library picture with its text (features/cases/thumbs.ts).
            const pic = sampleCoverFor(c) ?? libraryCoverFor(c.id);
            const own = pic ?? feedCover(c, x.backing.length);
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
                    <PersonFace name={c.from} />
                    <div className={s.div11}>
                      <span className={s.author}>{c.from}</span>
                      <span className={s.dept}>{c.fromDept ? <DeptChip name={c.fromDept} /> : null}{c.fromDept && (x.site || log.day - c.raisedDay >= 0) ? " · " : ""}{[x.site, ago(t, log.day - c.raisedDay)].filter(Boolean).join(" · ")}</span>
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
                <span className={s.latest} data-testid="feed-latest">{latestLine(c, x.activity)}</span>
                <span className={s.supporters}>{supportersLine(x)}</span>
                <div className={s.div14}>
                  <div className={s.div15}>
                    {avatars(x).map((a) => <PersonFace key={a.name} name={a.name} size="sm" />)}
                  </div>
                  <button type="button" className={s.toggleSupport} data-on={x.supported ? "true" : undefined} aria-pressed={x.supported}
                    onClick={(e) => { e.stopPropagation(); support(x); }}>
                    {x.supported ? <Check size={13} /> : <UpArrow size={13} w={2.6} />}{x.supported ? t("team.feedSupported") : t("team.feedSupport")}<span className={s.supCount}>{x.backing.length}</span>
                  </button>
                  <span className={s.commentCount}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg>
                    {x.comments}
                  </span>
                  <span className={s.label} />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nh-ghost)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </div>
              </div>
            );
          })}
        </div>
        {!list.length && <div className={s.div16}>{visible.length ? t("team.feedNoMatch") : split && view === "archive" ? t("team.feedNoArchive") : t("feed.emptyFeed")}</div>}
        <p className={s.windowNote}>{t("feed.windowFooter")}</p>
      </div>
    </div>
  );

  // The opened idea: left the case, its dials and what the AI found; right Support and comments.
  function renderOpen(item: Item, brief: IdeaBrief, steps: ReturnType<typeof overviewSteps>) {
    const { c } = item, st = feedStage(c, ctx.locale);
    const os = openScore[c.id] ?? null;
    const dial = os !== null ? brief.scores[os] : null;
    const cs = commentsOn(log, c.id).filter((m) => !m.rescore);
    const draft = drafts[c.id] ?? "";
    const nameOf = (m: { by: string; byUserId?: string | null }) => (isMe(m.byUserId) ? t("team.feedYou") : m.by);
    const count = item.backing.length;
    const myDept = deptNameOf(ctx.persona.who.name);
    const fromMine = item.backing.filter((b) => !isBacker(b, me) && deptNameOf(b.name) === myDept).length + (item.supported ? 1 : 0);
    const iTalked = cs.some((m) => isMe(m.byUserId));
    const anon = isHandle(c.from);
    const role = anon ? c.fromDept : roleOf(c.from) || c.fromDept;
    const send = () => {
      const t = draft.trim();
      if (!t) return;
      act.comment(c.id, t);
      setDrafts((d) => ({ ...d, [c.id]: "" }));
    };
    const splitBlock = dial?.blocks.find((b) => b.t === "split");
    return (
      <article className={s.article} data-screen-label="Feed post">
        <div className={s.div17}>
          <div className={s.div18}>
            <div className={s.div19}>
              <PersonFace name={c.from} />
              <div className={s.div11}>
                <span className={s.author2}>{c.from}</span>
                <span className={s.role}>{[role, item.site, t("team.feedRaised", { when: f(c.raisedDay) })].filter(Boolean).join(" · ")}</span>
              </div>
              <span className={s.stage} data-tone={st.tone}>{st.label}</span>
              <button type="button" className={s.closeIdea} onClick={() => close()} title={t("common.close")} aria-label={t("common.close")}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <span className={s.kind}>{c.kind === "idea" ? t("team.feedIdea") : t("team.feedProblem")}</span>
            <h2 className={s.title2}>{c.title}</h2>
            <p className={`${s.desc} ${s.ctxText}`}>{brief.description}</p>
            {(brief.depts.length > 0 || brief.people.length > 0) && (
              <div className={s.div20}>
                <span className={s.affects}>{t("team.feedAffects")}</span>
                <div className={s.div8}>
                  {brief.depts.map((d) => <DeptChip key={d.id} name={d.name} />)}
                  {brief.people.map((p) => <span key={p.name} className={s.name}><PersonFace name={p.name} size="sm" />{p.name}</span>)}
                </div>
              </div>
            )}
            {brief.context && (
              <div className={s.div21}>
                <span className={s.affects}>{t("team.feedContext")}</span>
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
                <span className={s.affects}>{t("team.feedAttachments")}</span>
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
                          <circle cx="36" cy="36" r="30" fill="none" stroke="var(--nh-brand)" strokeWidth="10" strokeLinecap="round" strokeDasharray={((sc.value / 100) * 141.4).toFixed(1) + " 188.5"} />
                        </svg>
                        <div className={s.div29}><span className={s.v} data-long={sc.value >= 100}>{sc.value}</span><span className={s.n100}>/ 100</span></div>
                        <button type="button" className={s.toggle} title={t("team.feedShowReasoning")} aria-label={on ? t("team.feedHideReasoningFor", { label: sc.label }) : t("team.feedShowReasoningFor", { label: sc.label })} aria-expanded={on}
                          onClick={() => setOpenScore((m) => ({ ...m, [c.id]: on ? null : i }))}>
                          <svg className={s.svg2} data-open={on ? "true" : undefined} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
                    <div className={s.div35}><span className={s.affects}>{t("team.feedPullingUp")}</span>{splitBlock.ups.map((u) => <p key={u.t} className={s.context}>{u.t}</p>)}</div>
                    <div className={s.div35}><span className={s.affects}>{t("team.feedHoldingBack")}</span>{splitBlock.downs.map((u) => <p key={u.t} className={s.context}>{u.t}</p>)}</div>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="var(--nh-brand)" /></svg>
                  <span className={s.span2}>{t("team.feedAiFound")}</span>
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
                  {brief.rec && <><span className={s.label2}>{t("team.feedAdvice")}</span><span className={s.advice}>{brief.actions.find((a) => a.key === brief.rec)?.label}</span></>}
                  <PromptRow label={t("team.feedWhy")} text={brief.recText} />
                  {brief.next && <PromptRow label={t("team.feedNextStep")} text={brief.next} />}
                  {brief.by && <PromptRow label={t("team.feedDecisionBy")} text={brief.by} />}
                </div>
                <div className={s.div42}>
                  <span className={s.affects}>{t("team.feedWhereItStands")}</span>
                  <div className={s.div43}>
                    {steps.map((t) => (
                      <div key={t.label} className={s.div44}>
                        <div className={s.div45} data-on={t.tone !== "todo" ? "true" : undefined} />
                        <span className={s.when}>{t.label}</span>
                        {t.sub && <span className={s.what}>{t.sub}</span>}
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
                  {avatars(item).map((a) => <PersonFace key={a.name} name={a.name} size="sm" />)}
                </div>
                <span className={s.div11}>
                  <span className={s.supLine}>{supportLine(item.backing, me)}</span>
                  {myDept && fromMine >= MIN_GROUP && <span className={s.size}>{item.supported ? t("team.feedFromDeptIncluding", { count: fromMine, dept: myDept }) : t("team.feedFromDeptBack", { count: fromMine, dept: myDept })}</span>}
                </span>
              </div>
              <button type="button" className={s.toggleSupport2} data-on={item.supported ? "true" : undefined} aria-pressed={item.supported} onClick={() => support(item)}>
                {item.supported
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  : <UpArrow size={18} w={2.8} />}
                {item.supported ? t("team.feedYouSupport") : c.kind === "idea" ? t("team.feedSupportIdea") : t("team.feedSupportProblem")}
              </button>
              <span className={s.mood}>{count ? brief.feed.sentiment : t("team.feedBeFirst")}</span>
            </div>
            <div className={s.div49}>
              <span className={s.comments}>{t("team.feedComments")}</span>
              <span className={s.affects}>{cs.length}</span>
            </div>
            <div className={s.div50}>
              {!cs.length && <span className={s.span3}>{t("team.feedNoComments")}</span>}
              {cs.map((m) => {
                return (
                  <div key={m.id} className={s.div51}>
                    <div className={s.div52}>
                      <PersonFace name={m.by} />
                      <div className={s.div53}>
                        <div className={s.div54}>
                          <span className={s.name3}>{nameOf(m)}</span>
                          <span className={s.role2}>{[isMe(m.byUserId) ? "" : roleOf(m.by) || deptNameOf(m.by), f(m.day)].filter(Boolean).join(" · ")}</span>
                        </div>
                        <p className={s.text2}>{m.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={s.div57}>
              {!item.supported && iTalked && (
                <div className={s.div58}>
                  <span className={s.nudgeText}>{iTalked ? t("team.feedJoined") : t("team.feedAgree")}</span>
                  <button type="button" className={s.toggleSupport3} onClick={() => support(item)}><UpArrow size={12} w={3} />{t("team.feedSupport")}</button>
                </div>
              )}
              <div className={s.div60}>
                <input className={s.input} value={draft} placeholder={t("team.feedAddComment")} aria-label={t("team.feedAddComment")}
                  onChange={(e) => { const v = e.target.value; setDrafts((d) => ({ ...d, [c.id]: v })); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }} />
                <button type="button" className={s.send} data-live={draft.trim() ? "true" : undefined} onClick={send} title={t("team.feedSend")} aria-label={t("team.feedSend")}>
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
