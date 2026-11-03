"use client";
// One case, opened on the dashboard: the left half of the Claude Design handoff "Overview", its
// markup and classes 1:1 (dc-convert -> Overview.module.css). The head card (meta, title, the five
// steps, whose desk and how much of the promise is used), then Idea | AI: the idea as it was raised
// and its revisions, or the five scores - one opens into its reasoning - and what the AI found.
// Props in, JSX out; nothing here is edited in place (MET D17).
import { Fragment, useState } from "react";
import { initialsOf } from "@/components/dashboard/leader/IdeaParts";
import { useT } from "@/i18n/client";
import type { OverviewStep } from "@/features/cases/rows";
import type { DeskLabel } from "@/features/overview/rows";
import type { IdeaBrief, NumberedBlock } from "@/features/ideas/brief";
import s from "./Overview.module.css";
import { avatarTone } from "@/lib/avatar";

export type IdeaMode = "idea" | "ai";
export type IdeaFile = { name: string; ext: string; meta: string };
export type OverviewIdeaProps = {
  id: string;
  title: string;
  raised: string; // "26 Sept"
  dept: string; // "Production, Line 3" (and who raised it, when it is not the viewer)
  steps: OverviewStep[];
  desk: DeskLabel;
  wait: { text: string; pct: number; tone: "open" | "late" | "done" };
  brief: IdeaBrief;
  files: IdeaFile[];
  added: { text: string; when: string }[]; // new information since it was raised
  versions: { n: number; when: string; title: string }[]; // the raiser's revisions, oldest first; empty with one
  mode: IdeaMode;
  onMode: (m: IdeaMode) => void;
  onClose: () => void;
  // On a phone (OverviewPhone) the same page without the close button (the bar has back), and the
  // scores as a row of rings - a tap opens the reasoning in a sheet (onOpenScore).
  variant?: "desk" | "phone";
  onOpenScore?: (i: number) => void;
};

export const Cites = ({ ns, dark }: { ns: number[]; dark?: boolean }) => <>{ns.map((c) => <a key={c} className={dark ? s.c2 : s.c} href="#aisrc">{c}</a>)}</>;
const Star = ({ size }: { size: number }) => (
  <svg className={s.svg2} width={size} height={size} viewBox="0 0 24 24"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="#007aff" /></svg>
);

export function OverviewIdea(p: OverviewIdeaProps) {
  const t = useT();
  const { brief } = p;
  const [openScore, setOpenScore] = useState<number | null>(null);
  const files = p.files;
  const affects = [...brief.depts.map((d) => d.name), ...brief.people.map((x) => x.name)];
  // Why each team or person is affected, where the raise page's analysis said so.
  const whyOf = (name: string) => [...brief.depts, ...brief.people].find((x) => x.name === name)?.why ?? null;
  const score = openScore == null ? null : brief.scores[openScore];
  const rec = brief.actions.find((a) => a.key === brief.rec);
  const phone = p.variant === "phone";
  // A press on either side of the slider flips it (the design toggles, whichever side you hit).
  const flip = () => p.onMode(p.mode === "idea" ? "ai" : "idea");
  const view = p.mode;
  const desk = p.desk;

  return (
    <div className={s.div22}>
      <div className={s.div23}>
        <div className={s.div24}>
          <div className={s.div25}>
            <span className={s.raised}>{t("team.ideaRaised", { raised: p.raised, dept: p.dept })}</span>
            {!phone && (
              <button type="button" className={s.closeOverview2} onClick={p.onClose} title={t("team.ideaCloseOverview")} aria-label={t("team.ideaBackOverview")}>
                <svg className={s.svg} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            )}
          </div>
          <h1 className={s.title2}>{p.title}</h1>
          <div className={s.div26}>
            {p.steps.map((st, i) => (
              <div key={st.label} className={s.div27}>
                <div className={s.div28} data-tone={st.tone} style={{ animationDelay: i * 90 + "ms" }} />
                <div className={s.div29}>
                  <span className={s.label2} data-tone={st.tone}>{st.label}</span>
                  <span className={s.sub}>{st.sub}</span>
                </div>
              </div>
            ))}
          </div>
          <div className={s.div30}>
            <span className={s.dept}>{t("team.ideaOnDeskOf")}</span>
            <span className={s.deskProfile}>
              <span className={s.initials2} data-avatar={avatarTone(desk.role ?? "")}>{initialsOf(desk.role ?? "?")}</span>
              {desk.role ?? t("overview.deskNone")}
              <span className={s.role2}>
                {desk.names.join(", ")}{desk.more > 0 ? " " + t("overview.deskMore", { count: desk.more }) : ""}
                {desk.role !== null && desk.names.length === 0 ? t("overview.deskVacant") : ""}
                {desk.escalation ? <span className={s.deskEsc}>{t("overview.deskMoved", { role: desk.escalation })}</span> : null}
              </span>
            </span>
            <span className={s.label} />
            <span className={s.waitText} data-tone={p.wait.tone}>
              <span className={s.span3}><span className={s.span4} style={{ width: p.wait.pct + "%" }} /></span>
              {p.wait.text}
            </span>
          </div>
        </div>

        <div className={s.div31}>
          <div className={s.div32}>
            <div className={s.div33} data-mode={p.mode} role="tablist" aria-label={t("team.ideaShow")}>
              <span className={s.span5} />
              <button type="button" role="tab" aria-selected={p.mode === "idea"} className={s.setManual} onClick={flip}>{t("team.ideaTab")}</button>
              <button type="button" role="tab" aria-selected={p.mode === "ai"} className={s.setChat} onClick={flip}><Star size={11} />{t("team.ideaTabAi")}</button>
            </div>
          </div>

          {view === "idea" ? (
            <div className={s.div36}>
              <p className={s.description}>{brief.description}</p>
              <div className={s.sec} data-tone="who">
                <span className={s.dept}>{t("team.ideaWho")}</span>
                <div className={s.kv}>
                  <span className={s.label4}>{t("team.ideaRaisedBy")}</span>
                  <span className={s.text}>{brief.author.name}{!brief.author.anonymous && brief.author.role && brief.author.role !== brief.author.dept ? " · " + brief.author.role : ""}</span>
                  {brief.author.dept && <><span className={s.label4}>{t("team.ideaTeam")}</span><span className={s.text}>{brief.author.dept}</span></>}
                  {brief.routing.map((r, k) => (
                    <Fragment key={r.name + k}>
                      <span className={s.label4}>{k === 0 ? t("team.ideaResponsible") : t("team.ideaNextInLine")}</span>
                      <span className={s.text}>
                        <span className={s.person}>
                          <span className={s.initials2} data-avatar={avatarTone(r.name)} aria-hidden="true">{initialsOf(r.name)}</span>
                          <span>{r.name}{r.role ? " · " + r.role : ""}<span className={s.why}>{r.why}</span></span>
                        </span>
                      </span>
                    </Fragment>
                  ))}
                </div>
              </div>
              <div className={s.sec} data-tone="affects">
                <span className={s.dept}>{t("team.ideaAffects")}</span>
                {/* One row per team or person, with why it is affected where the analysis said so. */}
                <ul className={s.list}>
                  {affects.map((a, k) => (
                    <li key={a + k} className={s.li}>
                      <span className={s.liMain}><span className={s.liTitle}>{a}</span>{whyOf(a) && <span className={s.liSub}>{whyOf(a)}</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* The context and its facts are one section: the paragraph, then the grouped facts. */}
              <div className={s.sec} data-tone="context">
                <span className={s.dept}>{t("team.ideaContext")}</span>
                <p className={s.context}>{brief.context || "—"}</p>
                {brief.prompts.length > 0 && (
                  <div className={s.kv}>
                    {brief.prompts.map((pr, k) => (
                      <Fragment key={pr.label + k}><span className={s.label4}>{pr.label}</span><span className={s.text}>{pr.text}</span></Fragment>
                    ))}
                  </div>
                )}
              </div>
              <div className={s.sec}>
                <span className={s.dept}>{t("team.ideaAttachments")}</span>
                {files.length === 0 && <span className={s.noAttachments}>{t("team.ideaNoAttachments")}</span>}
                {files.length > 0 && (
                  <ul className={s.list}>
                    {files.map((fl, k) => (
                      <li key={fl.name + k} className={s.li} title={fl.name}>
                        <span className={s.liExt} data-ext={fl.ext}>{fl.ext}</span>
                        <span className={s.liMain}><span className={s.liTitle}>{fl.name}</span></span>
                        <span className={s.liEnd}>{fl.meta}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {p.versions.length > 0 && (
                <div className={s.sec}>
                  <span className={s.dept}>{t("overview.versionsHeading")}</span>
                  <ul className={s.list}>
                    {p.versions.map((v) => (
                      <li key={v.n} className={s.li}>
                        <span className={s.liMain}><span className={s.liTitle}>{v.title}</span><span className={s.liSub}>{t("overview.versionRow", { n: v.n, when: v.when })}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {p.added.length > 0 && (
                <div className={s.sec}>
                  <span className={s.dept}>{t("team.ideaAddedSince")}</span>
                  {p.added.map((a, k) => (
                    <div key={k} className={s.div45}><span className={s.text2}>{a.text}</span><span className={s.when}>{a.when}</span></div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={s.div46}>
              {phone ? (
                <div className={s.rings} role="group" aria-label={t("team.ideaScores")}>
                  {brief.scores.map((sc, i) => (
                    <button key={sc.label} type="button" className={s.ringBtn} onClick={() => p.onOpenScore?.(i)} aria-label={t("team.ideaRingAria", { label: sc.label, value: sc.value })}>
                      <span className={s.ringWrap}>
                        <svg viewBox="0 0 72 72" width="52" height="52" className={s.ring} aria-hidden="true">
                          <circle cx="36" cy="36" r="30" fill="none" stroke="#e3eaf7" strokeWidth="10" strokeLinecap="round" strokeDasharray="141.4 188.5" />
                          <circle className={s.circle} cx="36" cy="36" r="30" fill="none" stroke="#007aff" strokeWidth="10" strokeLinecap="round" strokeDasharray={((sc.value / 100) * 141.4).toFixed(1) + " 188.5"} />
                        </svg>
                        <span className={s.ringNum}>{sc.value}</span>
                      </span>
                      <span className={s.ringLabel}>{sc.label}</span>
                    </button>
                  ))}
                  <span className={s.phoneHint}>{t("team.ideaTapScore")}</span>
                </div>
              ) : <div className={s.div47}>
                <div className={s.div48}>
                  <div className={s.div49}>
                    {brief.scores.map((sc, i) => {
                      const on = openScore === i;
                      return (
                        <div key={sc.label} className={s.div50} data-open={on ? "true" : undefined} style={{ animationDelay: i * 70 + "ms" }}>
                          <span className={s.label6}>{sc.label}</span>
                          <div className={s.div51}>
                            <svg className={s.svg3} viewBox="0 0 72 72">
                              <circle cx="36" cy="36" r="30" fill="none" stroke="#e3eaf7" strokeWidth="10" strokeLinecap="round" strokeDasharray="141.4 188.5" />
                              <circle className={s.circle} cx="36" cy="36" r="30" fill="none" stroke="#007aff" strokeWidth="10" strokeLinecap="round" strokeDasharray={((sc.value / 100) * 141.4).toFixed(1) + " 188.5"} style={{ animationDelay: i * 70 + "ms" }} />
                            </svg>
                            <div className={s.div52}><span className={s.value2} data-long={sc.value >= 100}>{sc.value}</span><span className={s.n100}>/ 100</span></div>
                            <button type="button" className={s.toggle} onClick={() => setOpenScore(on ? null : i)} title={t("team.ideaShowReasoning")} aria-label={on ? t("team.ideaHideReasoningFor", { label: sc.label }) : t("team.ideaShowReasoningFor", { label: sc.label })} aria-expanded={on}>
                              <svg className={s.svg4} viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                          </div>
                          {on && <><div className={s.div53} />{i > 0 && <div className={s.div54} />}{i < brief.scores.length - 1 && <div className={s.div55} />}</>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>}

              <div className={s.div56} data-joined={openScore === 0 ? "left" : openScore === brief.scores.length - 1 ? "right" : undefined}>
                {score && !phone ? (
                  <div className={s.div57}>
                    <div className={s.div18}><span className={s.dept}>{score.label}</span><p className={s.note}>{score.note}</p></div>
                    {score.blocks.map((b, k) => <Block key={k} b={b} />)}
                    <div className={s.sec} id="aisrc">
                      <span className={s.dept}>{t("team.ideaSources")}</span>
                      <div className={s.div43}>
                        {score.sources.map((src) => (
                          <a key={src.n} className={s.a} href="#aisrc">
                            <span className={s.ext2} data-ext={src.ext}>{src.ext}</span>
                            <span className={s.span2}>
                              <span className={s.name2}><span className={s.n}>{src.n}</span>{src.name}</span>
                              <span className={s.where}>{src.where}</span>
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={s.div10}>
                      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="#007aff" /></svg>
                      <span className={s.span7}>{t("team.ideaAiFound")}</span>
                    </div>
                    <div className={s.div62}>
                      <p className={s.note}>{brief.summary}<Cites ns={brief.cites.summary} /></p>
                      {brief.lead && <p className={s.p}>{brief.lead}<Cites ns={brief.cites.lead} /></p>}
                    </div>
                    {brief.bars && (
                      <div className={s.div58}>
                        <span className={s.dept}>{brief.bars.title}</span>
                        {brief.bars.rows.map((r) => (
                          <div key={r.label} className={s.div63}>
                            <span className={s.label7}>{r.label}</span>
                            <div className={s.div60}><div className={s.div61} style={{ width: r.pct + "%" }} /></div>
                            <span className={s.d}>{r.display}</span>
                          </div>
                        ))}
                        <span className={s.note2}>{brief.bars.note}<Cites ns={brief.cites.bars} dark /></span>
                      </div>
                    )}
                    {brief.after && <p className={s.p}>{brief.after}<Cites ns={brief.cites.after} /></p>}
                    <div className={s.kv}>
                      {rec && <><span className={s.label4}>{t("team.ideaAdvice")}</span><span className={s.advice}>{rec.label}</span></>}
                      <span className={s.label4}>{t("team.ideaWhy")}</span><span className={s.text}>{brief.recText}<Cites ns={brief.cites.rec} dark /></span>
                      {brief.next && <><span className={s.label4}>{t("team.ideaNextStep")}</span><span className={s.text}>{brief.next}</span></>}
                      {brief.by && <><span className={s.label4}>{t("team.ideaAnswerBy")}</span><span className={s.text}>{brief.by}</span></>}
                    </div>
                    {brief.timeline && (
                      <div className={s.sec}>
                        <span className={s.dept}>{brief.timeline.title}</span>
                        <div className={s.div65}>
                          {brief.timeline.steps.map((tl, k) => (
                            <div key={k} className={s.div66}><div className={s.div67} data-now={tl.now ? "true" : undefined} /><span className={s.stage}>{tl.when}</span><span className={s.what}>{tl.what}</span></div>
                          ))}
                        </div>
                      </div>
                    )}
                    {brief.questions.length > 0 && (
                      <div className={s.sec}>
                        <span className={s.dept}>{t("team.ideaWorthAdding")}</span>
                        <ol className={s.list}>
                          {brief.questions.map((q, k) => <li key={k} className={s.li}><span className={s.liNum}>{k + 1}</span><span className={`${s.liMain} ${s.liText}`}>{q}</span></li>)}
                        </ol>
                      </div>
                    )}
                    {brief.similar.length > 0 && (
                      <div className={s.sec}>
                        <span className={s.dept}>{t("team.ideaSimilar")}</span>
                        <ul className={s.list}>
                          {brief.similar.map((m) => (
                            <li key={m.title} className={s.li}>
                              <span className={s.liMain}><span className={s.liTitle}>{m.title}</span><span className={s.liSub}>{m.where}</span></span>
                              <span className={s.liEnd}><span className={s.liStatus}>{m.status}</span>{m.match != null && <span>{t("team.ideaMatch", { pct: m.match })}</span>}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className={s.kv}>
                      <span className={s.label4}>{t("team.ideaPattern")}</span><span className={s.text}>{brief.pattern}<Cites ns={brief.cites.pattern} dark /></span>
                      {brief.categories.length > 0 && <><span className={s.label4}>{t("team.ideaCategorised")}</span><span className={s.text}>{brief.categories.join(" · ")}</span></>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// One reasoning block in the design's four shapes; steps read as facts, a split as two texts.
export function Block({ b }: { b: NumberedBlock }) {
  const t = useT();
  switch (b.t) {
    case "text":
      return <div className={s.sec}><span className={s.dept}>{b.h}</span><p className={s.p}>{b.p}<Cites ns={b.cites} /></p></div>;
    case "facts":
      return <div className={s.kv}>{b.items.map((fa) => <Fragment key={fa.k}><span className={s.label4}>{fa.k}</span><span className={s.text}>{fa.v}<Cites ns={fa.cites} dark /></span></Fragment>)}</div>;
    case "steps":
      return <div className={s.kv}>{b.items.map((st) => <Fragment key={st.label}><span className={s.label4}>{st.dur}</span><span className={s.text}>{st.label} · {st.owner}<Cites ns={st.cites} dark /></span></Fragment>)}</div>;
    case "compare":
      return (
        <div className={s.div58}>
          <span className={s.label4}>{b.title}<Cites ns={b.cites} dark /></span>
          {b.rows.map((r) => (
            <div key={r.label} className={s.div59}>
              <span className={s.label7}>{r.label}</span>
              <div className={s.div60}><div className={s.div61} style={{ width: r.pct + "%" }} /></div>
              <span className={s.d}>{r.display}</span>
            </div>
          ))}
        </div>
      );
    case "quote":
      return (
        <div className={s.sec}>
          <span className={s.dept}>{b.h}</span>
          <p className={s.q}>“{b.q}”<Cites ns={b.cites} /></p>
          <div className={s.div16}><span className={s.who}><span className={s.ini} data-avatar={avatarTone(b.who)}>{initialsOf(b.who)}</span>{b.who}</span><span className={s.count}>{b.role}</span></div>
        </div>
      );
    case "split":
      return (
        <>
          <div className={s.sec}><span className={s.dept}>{t("team.ideaPullingUp")}</span>{b.ups.map((u) => <p key={u.t} className={s.p}>{u.t}<Cites ns={u.cites} /></p>)}</div>
          <div className={s.sec}><span className={s.dept}>{t("team.ideaHoldingBack")}</span>{b.downs.map((u) => <p key={u.t} className={s.p}>{u.t}<Cites ns={u.cites} /></p>)}</div>
        </>
      );
  }
}
