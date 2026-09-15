"use client";
// TEAM LEADER home: open items addressed to me, sorted by age, one action each - yes /
// no+why / hand over / ask one question. Port of the INBOX block in legacy/demo/index.html.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { deskCases, inboxSorted, openCases } from "@/components/dashboard/derive";
import { Avatar, Btn, Empty, Pill, reasonTone, type Tone } from "@/components/dashboard/shared/primitives";
import { ViewHead } from "@/components/dashboard/shared/ViewHead";
import { actedBy, onDesk } from "@/features/cases/selectors";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./InboxView.module.css";

export function InboxView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { seed, S, D, demo, persona, act, openSheet, showToast, deptName, ready, f } = ctx;
  // Selection: the page remounts this view (key = ?id) when a search result or link picks a case.
  const [cid, setCid] = useState<string | null>(initialId ?? null);
  if (!ready) return <div className={ui.loading} />;

  const who = persona.who, P = seed.promiseDays;
  const desk = deskCases(ctx), open = openCases(ctx);
  const inbox = inboxSorted(ctx);
  const sc = inbox.find((c) => c.id === cid) ?? inbox[0] ?? null;
  const route = sc?.route ?? null;
  const scMine = !!route && route.owner.name === who.name;
  const handTo = route ? (scMine ? route.deputy : route.owner.name) : "the triage desk";
  const lastHand = sc?.handed[sc.handed.length - 1];
  const handedNote = !sc ? ""
    : sc.escalated && sc.escalated.to === who.name && sc.assignee !== who.name
      ? "Escalated to you " + f(sc.escalated.day) + ": " + sc.assignee + " missed the " + P + "-day promise, so the map moved it sideways. Either of you can answer; whoever does, stops the clock."
      : sc.escalated && sc.assignee === who.name
        ? "Past the promise since " + f(sc.escalated.day) + " — " + sc.escalated.to + " now sees it too. Answer before they do."
        : lastHand ? "Came to you from " + lastHand.from + " " + f(lastHand.day) + (lastHand.why ? " — “" + lastHand.why + "”" : "") + "." : "";

  const cleared = D.cases.map((c) => ({ c, did: actedBy(c, who.name) })).filter((x) => x.did === "decided" || x.did === "handed");
  const overdue = open.filter((c) => c.overdue).length;
  const stats = [
    { v: String(desk.length), l: open.length === desk.length ? "open, addressed to you" : "open, addressed to you · " + (desk.length - open.length) + " paused" },
    { v: String(overdue), l: "past the " + P + "-day promise", hot: overdue > 0 },
    { v: demo ? seed.metrics.lead.medianAnswer : "—", l: "your median time to answer" },
    { v: demo ? seed.metrics.lead.withinPromise : "—", l: "answered within the promise, Q3" },
  ];

  // What the team leader's own team is waiting on elsewhere - the other end of the same asymmetry (§12).
  const myDeptName = deptName(persona.role.dept);
  const deptOfPerson = (name: string) => { const r = seed.routes.find((x) => x.owner.name === name); return r ? deptName(r.owner.dept) : seed.buddies.find((b) => b.name === name)?.dept ?? "—"; };
  const waitingOn = D.cases
    .filter((c) => (c.open || c.status === "asked") && !onDesk(c, who.name) && c.fromDept.indexOf(myDeptName) === 0)
    .map((c) => ({ key: c.id, title: c.title, owner: c.assignee, dept: deptOfPerson(c.assignee), age: c.clock, promised: P, paused: c.status === "asked", escalatedTo: c.escalated?.to ?? null }))
    .concat(D.waitingOn.map((w) => ({ key: w.title, title: w.title, owner: w.owner, dept: w.dept, age: w.age + S.day, promised: w.promised, paused: false, escalatedTo: null })));

  const sel = (c: (typeof inbox)[number]) => { if (c.read === null) act.read(c.id); setCid(c.id); };

  return (
    <>
      <ViewHead view="inbox" />
      <div className={ui.stack14}>
        <div className={ui.stats}>
          {stats.map((k) => (
            <div key={k.l} className={ui.stat}>
              <div className={ui.statV} data-hot={k.hot ? "true" : undefined}>{k.v}</div>
              <div className={ui.statL}>{k.l}</div>
            </div>
          ))}
        </div>

        <div className={ui.split}>
          <div className={ui.stack}>
            <div className={`${ui.card} ${ui.cardList}`}>
              {inbox.length === 0 && (
                <Empty title={demo ? "Inbox empty" : "Nothing addressed to you yet"}
                  sub={demo ? "Nothing is waiting on you. That is the goal by the end of every day." : "When someone on your team, or in a neighbouring one, raises a problem the map routes to you, it lands here with a " + P + "-day clock."} />
              )}
              <div className={ui.list} data-roomy="true">
                {inbox.map((c) => {
                  const paused = c.status === "asked";
                  const toMe = !!(c.escalated && c.escalated.to === who.name && c.assignee !== who.name);
                  const late = c.clock > P, soon = c.clock >= P - 2 && !late;
                  const tone: Tone = paused ? "soft" : toMe ? "ink" : reasonTone(c.reason);
                  return (
                    <div key={c.id} className={ui.row} data-active={sc?.id === c.id ? "true" : undefined} data-paused={paused ? "true" : undefined} onClick={() => sel(c)}>
                      <div className={ui.mark} />
                      <div className={ui.rowBody}>
                        <div className={styles.rowTop}>
                          <div className={styles.rowMain}>
                            <div className={styles.caseTitle}>{c.title}</div>
                            <div className={ui.rowSub}>{c.from} · {c.fromDept}</div>
                          </div>
                          <div className={styles.rowRight}>
                            <span className={styles.clock} data-tone={paused ? "paused" : late ? "late" : soon ? "soon" : undefined}>
                              {paused ? "clock paused" : late ? c.clock - P + " d past the promise" : P - c.clock + " d left"}
                            </span>
                            <span className={styles.open}>open {c.clock} d</span>
                          </div>
                        </div>
                        <div className={`${ui.chips} ${styles.why}`}>
                          <span className={styles.whyLabel}>why it is still open:</span>
                          <Pill tone={tone}>{paused ? "waiting on " + c.from : toMe ? "escalated from " + c.assignee : c.reason}</Pill>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {cleared.length > 0 && (
                <div className={styles.cleared}>
                  <div className={ui.eyebrow}>Cleared today</div>
                  <div className={`${ui.list} ${ui.mt8}`}>
                    {cleared.map(({ c, did }) => (
                      <div key={c.id} className={styles.clearedRow}>
                        <span className={styles.clearedTitle}>{c.title}</span>
                        <Pill tone={did === "handed" ? "soft" : "ink"}>
                          {did === "decided" && c.decided ? "Decided · " + c.decided.answer + (c.decided.reason && c.decided.answer === "no" ? " · " + c.decided.reason : "") : "Handed over · " + c.assignee}
                        </Pill>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={`${ui.card} ${styles.waitingCard}`}>
              <div className={ui.head}>
                <span className={ui.h}>Your team is waiting on</span>
                <span className={ui.rowMeta}>the other end of the same problems</span>
              </div>
              {waitingOn.length === 0 && <div className={ui.emptyLine}>Nothing your team raised is sitting with another department.</div>}
              <div className={`${ui.list} ${ui.mt8}`} data-roomy="true">
                {waitingOn.map((w) => (
                  <div key={w.key} className={styles.waitRow}>
                    <div className={ui.between}>
                      <span className={styles.waitTitle}>{w.title}</span>
                      <span className={styles.waitAge}>{w.age} d</span>
                    </div>
                    <div className={`${ui.chips} ${styles.waitMeta}`}>
                      <span className={styles.waitWith}>with {w.owner} · {w.dept}</span>
                      <span className={styles.waitState} data-hot={w.age > w.promised ? "true" : undefined}>
                        {w.paused ? "paused · they asked the sender a question"
                          : w.age > w.promised ? w.age - w.promised + " d past the promise · escalated" + (w.escalatedTo ? " to " + w.escalatedTo : "")
                            : "answer owed in " + (w.promised - w.age) + " d"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${ui.sticky} ${ui.stack}`}>
            <div className={ui.card}>
              <div className={ui.eyebrow}>Selected case</div>
              {!sc ? (
                <>
                  <div className={ui.h2}>{demo ? "Inbox empty" : "Nothing addressed to you yet"}</div>
                  <div className={`${ui.body} ${ui.mt8}`}>{demo ? "Nothing is waiting on you. That is the goal by the end of every day." : "When someone raises a problem the map routes to you, it lands here with a " + P + "-day clock."}</div>
                </>
              ) : (
                <>
                  <div className={ui.h2}>{sc.title}</div>
                  <div className={`${ui.chips} ${styles.selMeta}`}>
                    <Pill tone={reasonTone(sc.reason)}>{sc.reason}</Pill>
                    <span className={ui.small}>{sc.clock} days open</span>
                  </div>
                  <div className={`${ui.quote} ${ui.mt14}`}>
                    <div className={ui.quoteText}>{sc.body}</div>
                    <div className={ui.quoteBy}><Avatar name={sc.from} size="sm" /> {sc.from} · {sc.fromDept}</div>
                  </div>
                  <div className={`${ui.grid2} ${ui.mt14}`}>
                    <div className={ui.tile}><div className={ui.tileTitle}>{sc.upside || "not estimated yet"}</div><div className={ui.tileL}>what it costs while it waits</div></div>
                    <div className={ui.tile}><div className={ui.tileTitle}>{route ? route.buddy : "—"}</div><div className={ui.tileL}>buddy for this, if you need one</div></div>
                  </div>

                  <div className={`${ui.eyebrow} ${styles.section}`}>{!route ? "The map has no entry for this" : scMine ? "The map says this is yours" : "The map proposes another owner"}</div>
                  <div className={`${ui.tile} ${styles.routeTile}`}>
                    <div className={ui.tileTitle}>
                      {!route ? "Triage desk" : scMine ? "You · " + route.owner.role : route.owner.name + " · " + route.owner.role + (route.owner.role.includes(deptName(route.owner.dept)) ? "" : ", " + deptName(route.owner.dept))}
                    </div>
                    <div className={ui.tileSub}>row: {route ? route.type : "no matching route — a human triages it"} · deputy {route ? route.deputy : "—"}</div>
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
                    <div className={styles.pausedNote}>Waiting for {sc.from} to answer. The clock is paused at {sc.clock}{sc.clock === 1 ? " day" : " days"}; it resumes when they reply.</div>
                  )}

                  {sc.open && (
                    <>
                      <div className={`${ui.eyebrow} ${styles.section}`}>One action</div>
                      <div className={`${ui.btnRow} ${styles.actions}`}>
                        <Btn kind="primary" onClick={() => { act.decide(sc.id, "yes"); showToast("Answered “yes” in " + sc.clock + " days. " + sc.from + " has been told; the clock is stopped."); }}>Yes, do it</Btn>
                        <Btn onClick={() => openSheet("no", sc.id)}>No, and why</Btn>
                      </div>
                      <div className={ui.btnRow}>
                        <Btn kind="accent" onClick={() => openSheet("hand", sc.id, { picked: handTo })}>{scMine ? "Hand to " + handTo : "Pass to " + handTo}</Btn>
                        <Btn onClick={() => openSheet("ask", sc.id)}>Ask one question</Btn>
                      </div>
                      <div className={styles.actionNote}>Whatever you pick, the person who raised it is told today. A question pauses the clock; a hand-over keeps it running.</div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
