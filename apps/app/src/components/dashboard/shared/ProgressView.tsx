"use client";
// Does the system actually move: the funnel, whether shipped work delivered, what is stuck the
// longest, and whether people got an answer. Port of the PROGRESS block in legacy/demo/index.html.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Avatar, Pill, verdictTone } from "@/components/dashboard/shared/primitives";
import { ViewHead } from "@/components/dashboard/shared/ViewHead";
import { contributors, funnel, stalled } from "@/features/metrics";
import { fmt } from "@/lib/utils/format";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./ProgressView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

export function ProgressView() {
  const ctx = useDemo();
  const { seed, D, N, demo, persona, ready } = ctx;
  if (!ready) return <PageSkeleton kind="list" delay />;
  const M = seed.metrics, P = seed.promiseDays, O = seed.outcomeDays;
  const steps = funnel(N);
  const stuck = stalled(D);
  const top = contributors(D, persona.who.handle);
  const unanswered = N.overdueIdeas + D.cases.filter((c) => c.overdue).length;

  return (
    <>
      <ViewHead view="progress" />
      <div className={ui.stack14}>
        <div className={ui.card}>
          <div className={ui.head}>
            <div>
              <div className={ui.h}>How ideas actually move</div>
              <div className={ui.sub}>Twelve months, every stage. Read the width, not the number.</div>
            </div>
            <span className={ui.small}>{N.signals ? N.signals + " in · " + N.shippedIdeas + " out" : "nothing in yet"}</span>
          </div>
          <div className={styles.funnel}>
            {steps.map((f) => (
              <div key={f.label}>
                <div className={styles.funnelHead}>
                  <span className={styles.funnelN}>{demo ? f.n : "—"}</span>
                  <span className={styles.funnelLabel}>{f.label}</span>
                  <span className={ui.rowMeta}>{demo ? f.sub : ""}</span>
                </div>
                <div className={styles.funnelTrack}>
                  <div className={styles.funnelFill} data-gate={f.gate ? "true" : undefined} style={{ width: (demo ? f.pct : 0) + "%" }} />
                </div>
                {f.note && demo && <div className={styles.funnelNote}>{f.note}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.split}>
          <div className={ui.card}>
            <div className={ui.h}>Did the shipped ones deliver</div>
            <div className={ui.sub}>Promised at approval, measured {O} days after launch.</div>
            {D.outcomes.length === 0 && <div className={ui.emptyLine}>Nothing shipped yet. The first outcome is measured {O} days after the first launch.</div>}
            <div className={`${ui.list} ${ui.mt}`}>
              {D.outcomes.map((o) => (
                <div key={o.title} className={ui.listRow}>
                  <div className={ui.between}>
                    <span className={ui.listTitle}>{o.title}</span>
                    <Pill tone={verdictTone(o.verdict)}>{o.verdict}</Pill>
                  </div>
                  <div className={`${ui.chips} ${styles.outcomeMeta}`}>
                    <span className={ui.rowMeta}>promised <span className={styles.promised}>{o.promised}</span></span>
                    <span className={ui.rowMeta}>measured <span className={styles.measured}>{o.actual}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={ui.card}>
            <div className={ui.h}>Stuck the longest</div>
            <div className={ui.sub}>Nothing here is blocked by money or by effort.</div>
            {stuck.length === 0 && <div className={ui.emptyLine}>Nothing is stuck yet.</div>}
            <div className={`${ui.list} ${ui.mt}`}>
              {stuck.map((i) => (
                <div key={i.id} className={ui.listRow}>
                  <div className={ui.between}>
                    <span className={ui.listTitle}>{i.title}</span>
                    <Pill tone={i.wait ? "accent" : "ink"}>{i.wait ? i.wait + " days" : "no owner"}</Pill>
                  </div>
                  <div className={`${ui.rowMeta} ${styles.stuckAt}`}>{i.wait ? i.blocker || i.teamNote : i.teamNote}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={ui.card}>
            <div className={ui.h}>Did anyone answer them</div>
            <div className={ui.sub}>People keep contributing only while their input visibly lands.</div>
            <div className={`${ui.grid2} ${ui.mt14}`}>
              <div className={ui.tile}><div className={styles.bigV}>{demo ? M.answered.replied : "—"}</div><div className={ui.tileL}>signals given a human reply, by name</div></div>
              <div className={ui.tile}><div className={styles.bigV}>{demo ? M.answered.median : "—"}</div><div className={ui.tileL}>median time to that reply</div></div>
              <div className={ui.tile}><div className={styles.bigV}>{demo ? fmt(M.answered.credited) : "0"}</div><div className={ui.tileL}>people credited on shipped work</div></div>
              <div className={ui.tile}><div className={styles.bigV} data-hot={demo ? "true" : undefined}>{unanswered}</div><div className={ui.tileL}>unanswered over {P} days</div></div>
            </div>

            <div className={`${ui.eyebrow} ${ui.mt20}`}>Most relied-on contributors</div>
            {top.length === 0 && <div className={ui.emptyLine}>Nobody has contributed yet.</div>}
            <div className={`${ui.list} ${ui.mt8}`}>
              {top.map((r) => (
                <div key={r.name} className={`${ui.personRow} ${styles.contrib}`}>
                  <Avatar name={r.name} />
                  <div className={ui.rowBody}>
                    <div className={styles.contribName}>{r.name}</div>
                    <div className={styles.contribMeta}>{r.dept || "—"} · {r.signals + (r.signals === 1 ? " signal" : " signals")} · {r.ideas + (r.ideas === 1 ? " idea" : " ideas")}</div>
                  </div>
                  <span className={styles.credit}>{r.shipped ? r.shipped + " shipped" : r.building ? r.building + " building" : r.awaiting ? "awaiting decision" : "no team yet"}</span>
                </div>
              ))}
            </div>
            <div className={`${ui.note} ${styles.anonNote}`}>Anonymous contributors keep a stable handle, so credit still accrues without revealing who they are.</div>
          </div>
        </div>
      </div>
    </>
  );
}
