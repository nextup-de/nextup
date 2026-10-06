"use client";
// One case, opened on the dashboard: the left half of the Claude Design handoff "Overview", its
// markup and classes 1:1 (dc-convert -> Overview.module.css). The head card (meta, title, the five
// steps, whose desk and how much of the promise is used), then Idea | AI: the idea itself, editable
// in place, or the five scores - one opens into its reasoning - and what the AI found. Props in,
// JSX out; a saved edit goes up through onSave (a stand-in until editing has its event).
import { Fragment, useEffect, useRef, useState } from "react";
import { initialsOf } from "@/components/dashboard/leader/IdeaParts";
import type { OverviewStep } from "@/features/cases/rows";
import { extOf, type IdeaBrief, type NumberedBlock } from "@/features/ideas/brief";
import type { IdeaEdit, IdeaFile } from "./overviewPreview";
import s from "./Overview.module.css";
import { avatarTone } from "@/lib/avatar";

export type IdeaMode = "idea" | "ai";
export type OverviewIdeaProps = {
  id: string;
  title: string;
  raised: string; // "26 Sept"
  dept: string; // "Production, Line 3" (and who raised it, when it is not the viewer)
  steps: OverviewStep[];
  desk: { name: string; role: string };
  wait: { text: string; pct: number; tone: "open" | "late" | "done" };
  brief: IdeaBrief;
  files: IdeaFile[];
  added: { text: string; when: string }[]; // new information since it was raised
  mode: IdeaMode;
  onMode: (m: IdeaMode) => void;
  editSignal: number; // bumped by the chat's "Add details": back to the idea, in edit mode
  edit: IdeaEdit | null; // the idea as last saved in edit mode
  onSave: ((e: IdeaEdit) => void) | null; // null: this viewer cannot edit it
  onProfile: ((e: React.MouseEvent<HTMLElement>) => void) | null;
  onClose: () => void;
  // On a phone (OverviewPhone) the same page without the close button (the bar has back), and the
  // scores as a row of rings - a tap opens the reasoning in a sheet (onOpenScore).
  variant?: "desk" | "phone";
  onOpenScore?: (i: number) => void;
};

const sizeOf = (bytes: number) => (bytes > 1e6 ? (bytes / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1e3)) + " KB");
const X = () => (
  <svg className={s.svg} width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#3a3a3c" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const Cites = ({ ns, dark }: { ns: number[]; dark?: boolean }) => <>{ns.map((c) => <a key={c} className={dark ? s.c2 : s.c} href="#aisrc">{c}</a>)}</>;
const Star = ({ size }: { size: number }) => (
  <svg className={s.svg2} width={size} height={size} viewBox="0 0 24 24"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="#007aff" /></svg>
);

export function OverviewIdea(p: OverviewIdeaProps) {
  const { brief } = p;
  const [openScore, setOpenScore] = useState<number | null>(null);
  const [editing, setEditing] = useState<IdeaEdit | null>(null);
  const [affDraft, setAffDraft] = useState("");
  const buildRef = useRef<HTMLDivElement>(null);
  const shown: IdeaEdit = p.edit ?? {
    description: brief.description, context: brief.context ?? "", prompts: brief.prompts,
    affects: [...brief.depts.map((d) => d.name), ...brief.people.map((x) => x.name)], files: p.files,
  };
  const startEdit = () => { setEditing({ ...shown, prompts: shown.prompts.map((x) => ({ ...x })) }); setAffDraft(""); };

  // "Add details" from the chat: the Idea tab, in edit mode, scrolled into view.
  const [seenSignal, setSeenSignal] = useState(p.editSignal);
  if (p.editSignal !== seenSignal) {
    setSeenSignal(p.editSignal);
    if (p.onSave && !editing) startEdit();
  }
  useEffect(() => {
    if (p.editSignal) requestAnimationFrame(() => buildRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [p.editSignal]);

  const e = editing;
  const patch = (x: Partial<IdeaEdit>) => setEditing((d) => (d ? { ...d, ...x } : d));
  const save = () => { if (!e || !p.onSave) return; p.onSave({ ...e, prompts: e.prompts.filter((x) => x.label.trim() || x.text.trim()) }); setEditing(null); };
  const addFiles = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(ev.target.files ?? []).map((f) => ({ name: f.name, ext: extOf(f.name).slice(0, 4) || "FILE", meta: sizeOf(f.size) }));
    ev.target.value = "";
    if (e) patch({ files: [...e.files, ...picked] });
  };
  const files = (e ?? shown).files;
  const score = openScore == null ? null : brief.scores[openScore];
  const rec = brief.actions.find((a) => a.key === brief.rec);
  const phone = p.variant === "phone";
  // A press on either side of the slider flips it (the design toggles, whichever side you hit).
  const flip = () => { if (p.mode === "idea") setEditing(null); p.onMode(p.mode === "idea" ? "ai" : "idea"); };
  const view = p.mode;

  return (
    <div className={s.div22}>
      <div className={s.div23}>
        <div className={s.div24}>
          <div className={s.div25}>
            <span className={s.raised}>Raised {p.raised} · {p.dept}</span>
            {!phone && (
              <button type="button" className={s.closeOverview2} onClick={p.onClose} title="Close overview" aria-label="Back to the dashboard">
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
            <span className={s.dept}>On the desk of</span>
            {p.onProfile ? (
              <button type="button" className={s.deskProfile} onClick={p.onProfile} title={"View " + p.desk.name}>
                <span className={s.initials2} data-avatar={avatarTone(p.desk.name)}>{initialsOf(p.desk.name)}</span>{p.desk.name}<span className={s.role2}>{p.desk.role}</span>
              </button>
            ) : (
              <span className={s.deskProfile}><span className={s.initials2} data-avatar={avatarTone(p.desk.name)}>{initialsOf(p.desk.name)}</span>{p.desk.name}<span className={s.role2}>{p.desk.role}</span></span>
            )}
            <span className={s.label} />
            <span className={s.waitText} data-tone={p.wait.tone}>
              <span className={s.span3}><span className={s.span4} style={{ width: p.wait.pct + "%" }} /></span>
              {p.wait.text}
            </span>
          </div>
        </div>

        <div className={s.div31} ref={buildRef}>
          <div className={s.div32}>
            <div className={s.div33} data-mode={p.mode} role="tablist" aria-label="Show">
              <span className={s.span5} />
              <button type="button" role="tab" aria-selected={p.mode === "idea"} className={s.setManual} onClick={flip}>Idea</button>
              <button type="button" role="tab" aria-selected={p.mode === "ai"} className={s.setChat} onClick={flip}><Star size={11} />AI</button>
            </div>
            {e && view === "idea" && (
              <div className={s.div34}>
                <button type="button" className={s.cancelEdit} onClick={() => setEditing(null)}>Cancel</button>
                <button type="button" className={s.saveEdit} onClick={save}>Save</button>
              </div>
            )}
            <div className={s.div35}>
              {!e && view === "idea" && p.onSave && (
                <button type="button" className={s.startEdit} onClick={startEdit} title="Edit idea" aria-label="Edit idea">
                  <svg className={s.svg} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
                </button>
              )}
            </div>
          </div>

          {view === "idea" ? (
            <div className={s.div36}>
              {e
                ? <textarea className={s.textarea} value={e.description} onChange={(ev) => patch({ description: ev.target.value })} rows={4} aria-label="Description" />
                : <p className={s.description}>{shown.description}</p>}
              <div className={s.div37}>
                <span className={s.dept}>Affects</span>
                <div className={s.div38}>
                  {(e ?? shown).affects.map((a, k) => (
                    <span key={a + k} className={s.label3}>
                      {a}
                      {e && <button type="button" className={s.remove} onClick={() => patch({ affects: e.affects.filter((_, j) => j !== k) })} title="Remove" aria-label={"Remove " + a}><X /></button>}
                    </span>
                  ))}
                  {e && (
                    <input className={s.addDepartment} value={affDraft} onChange={(ev) => setAffDraft(ev.target.value)} placeholder="+ Add department" aria-label="Add a department"
                      onKeyDown={(ev) => { if (ev.key === "Enter" && affDraft.trim()) { ev.preventDefault(); patch({ affects: [...e.affects, affDraft.trim()] }); setAffDraft(""); } }} />
                  )}
                </div>
              </div>
              <div className={s.div39}>
                <span className={s.dept}>Context</span>
                {e
                  ? <textarea className={s.textarea2} value={e.context} onChange={(ev) => patch({ context: ev.target.value })} rows={3} aria-label="Context" />
                  : <p className={s.context}>{shown.context || "—"}</p>}
              </div>
              {e ? (
                <div className={s.div41}>
                  {e.prompts.map((pr, k) => (
                    <div key={k} className={s.div42}>
                      <input className={s.label5} value={pr.label} placeholder="Label" aria-label="Fact label" onChange={(ev) => patch({ prompts: e.prompts.map((y, j) => (j === k ? { ...y, label: ev.target.value } : y)) })} />
                      <input className={s.value} value={pr.text} placeholder="Value" aria-label="Fact value" onChange={(ev) => patch({ prompts: e.prompts.map((y, j) => (j === k ? { ...y, text: ev.target.value } : y)) })} />
                      <button type="button" className={s.remove2} onClick={() => patch({ prompts: e.prompts.filter((_, j) => j !== k) })} title="Remove" aria-label="Remove this fact"><X /></button>
                    </div>
                  ))}
                  <button type="button" className={s.addPrompt} onClick={() => patch({ prompts: [...e.prompts, { label: "", text: "" }] })}>+ Add fact</button>
                </div>
              ) : (
                <div className={s.div40}>
                  {shown.prompts.map((pr, k) => (
                    <Fragment key={pr.label + k}><span className={s.label4}>{pr.label}</span><span className={s.text}>{pr.text}</span></Fragment>
                  ))}
                </div>
              )}
              <div className={s.div37}>
                <span className={s.dept}>Attachments</span>
                {files.length === 0 && !e && <span className={s.noAttachments}>No attachments.</span>}
                <div className={s.div43}>
                  {files.map((fl, k) => (
                    <div key={fl.name + k} className={s.div44}>
                      <span className={s.ext}>{fl.ext}</span>
                      <span className={s.span6}><span className={s.name}>{fl.name}</span><span className={s.dept}>{fl.meta}</span></span>
                      {e && <button type="button" className={s.remove3} onClick={() => patch({ files: e.files.filter((_, j) => j !== k) })} title="Remove" aria-label={"Remove " + fl.name}><X /></button>}
                    </div>
                  ))}
                  {e && <label className={s.addFile}>+ Add file<input className={s.input} type="file" multiple onChange={addFiles} /></label>}
                </div>
              </div>
              {p.added.length > 0 && (
                <div className={s.div37}>
                  <span className={s.dept}>Added since you raised it</span>
                  {p.added.map((a, k) => (
                    <div key={k} className={s.div45}><span className={s.text2}>{a.text}</span><span className={s.when}>{a.when}</span></div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={s.div46}>
              {phone ? (
                <div className={s.rings} role="group" aria-label="Scores">
                  {brief.scores.map((sc, i) => (
                    <button key={sc.label} type="button" className={s.ringBtn} onClick={() => p.onOpenScore?.(i)} aria-label={sc.label + " " + sc.value + " of 100, show the reasoning"}>
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
                  <span className={s.phoneHint}>Tap a score for the reasoning</span>
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
                            <div className={s.div52}><span className={s.value2}>{sc.value}</span><span className={s.n100}>/ 100</span></div>
                            <button type="button" className={s.toggle} onClick={() => setOpenScore(on ? null : i)} title="Show reasoning" aria-label={(on ? "Hide" : "Show") + " the reasoning for " + sc.label} aria-expanded={on}>
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
                    <div className={s.div37} id="aisrc">
                      <span className={s.dept}>Sources</span>
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
                      <span className={s.span7}>What the AI found</span>
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
                    <div className={s.div40}>
                      {rec && <><span className={s.label4}>Advice</span><span className={s.advice}>{rec.label}</span></>}
                      <span className={s.label4}>Why</span><span className={s.text}>{brief.recText}<Cites ns={brief.cites.rec} dark /></span>
                      {brief.next && <><span className={s.label4}>Next step</span><span className={s.text}>{brief.next}</span></>}
                      {brief.by && <><span className={s.label4}>Answer by</span><span className={s.text}>{brief.by}</span></>}
                    </div>
                    {brief.timeline && (
                      <div className={s.div64}>
                        <span className={s.dept}>{brief.timeline.title}</span>
                        <div className={s.div65}>
                          {brief.timeline.steps.map((tl, k) => (
                            <div key={k} className={s.div66}><div className={s.div67} data-now={tl.now ? "true" : undefined} /><span className={s.stage}>{tl.when}</span><span className={s.what}>{tl.what}</span></div>
                          ))}
                        </div>
                      </div>
                    )}
                    {brief.questions.length > 0 && (
                      <div className={s.div39}>
                        <span className={s.dept}>Worth adding</span>
                        {brief.questions.map((q, k) => <div key={k} className={s.div68}><span className={s.n2}>{k + 1}</span><p className={s.p}>{q}</p></div>)}
                      </div>
                    )}
                    <div className={s.div39}><span className={s.dept}>Pattern</span><p className={s.p}>{brief.pattern}<Cites ns={brief.cites.pattern} /></p></div>
                    <div className={s.div37}>
                      <span className={s.dept}>Categorised as</span>
                      <div className={s.div69}>{brief.categories.map((cat) => <span key={cat} className={s.cat}>{cat}</span>)}</div>
                    </div>
                    {brief.similar.length > 0 && (
                      <div className={s.div70}>
                        <span className={s.dept}>Similar ideas</span>
                        {brief.similar.map((m) => (
                          <div key={m.title} className={s.div9}>
                            <div className={s.div25}><span className={s.title3}>{m.title}</span><span className={s.status2}>{m.status}</span>{m.match != null && <span className={s.match}>{m.match}% match</span>}</div>
                            <span className={s.dept}>{m.where}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
  switch (b.t) {
    case "text":
      return <div className={s.div39}><span className={s.dept}>{b.h}</span><p className={s.p}>{b.p}<Cites ns={b.cites} /></p></div>;
    case "facts":
      return <div className={s.div40}>{b.items.map((fa) => <Fragment key={fa.k}><span className={s.label4}>{fa.k}</span><span className={s.text}>{fa.v}<Cites ns={fa.cites} dark /></span></Fragment>)}</div>;
    case "steps":
      return <div className={s.div40}>{b.items.map((st) => <Fragment key={st.label}><span className={s.label4}>{st.dur}</span><span className={s.text}>{st.label} · {st.owner}<Cites ns={st.cites} dark /></span></Fragment>)}</div>;
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
        <div className={s.div37}>
          <span className={s.dept}>{b.h}</span>
          <p className={s.q}>“{b.q}”<Cites ns={b.cites} /></p>
          <div className={s.div16}><span className={s.who}><span className={s.ini} data-avatar={avatarTone(b.who)}>{initialsOf(b.who)}</span>{b.who}</span><span className={s.count}>{b.role}</span></div>
        </div>
      );
    case "split":
      return (
        <>
          <div className={s.div39}><span className={s.dept}>Pulling it up</span>{b.ups.map((u) => <p key={u.t} className={s.p}>{u.t}<Cites ns={u.cites} /></p>)}</div>
          <div className={s.div39}><span className={s.dept}>Holding it back</span>{b.downs.map((u) => <p key={u.t} className={s.p}>{u.t}<Cites ns={u.cites} /></p>)}</div>
        </>
      );
  }
}
