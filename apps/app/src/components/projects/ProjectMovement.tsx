"use client";
// /progress, "Movement since baseline" (docs/plans/2026-10-15_idea-to-project.md §4): the real number
// before and after for every measured project, with the computed verdict - worse ones too - and the
// Wait ledger past the decision: late starts, measures owed, projects without a number, and how long
// a yes waits for its start and a done project for its first measure. Counts and medians only.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { projectLabel } from "@/features/projects/selectors";
import { changeText, fmtNumber, measuredProjects, movement, projectWaits, visibleProjects, type WaitStat } from "@/features/projects/views";
import { VerdictChip, viewerOf } from "./parts";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./Projects.module.css";

const days = (n: number | null) => (n === null ? "—" : fmtNumber(n) + (n === 1 ? " day" : " days"));
const waitSub = (w: WaitStat, still: string) => (w.n ? "median over " + w.n + (w.n === 1 ? " project" : " projects") : "nothing yet") + (w.waiting ? " · " + w.waiting + " " + still : "");

export function ProjectMovement() {
  const ctx = useDemo();
  const { S, demo, href } = ctx;
  const list = visibleProjects(S, viewerOf(ctx), demo);
  const measured = measuredProjects(list);
  const waits = projectWaits(list);
  const L = S.ledger;

  return (
    <div className={styles.split}>
      <div className={ui.card}>
        <div className={ui.h}>Movement since baseline</div>
        <div className={ui.sub}>The number before the start against the number at each check. The verdict is computed, and worse shows too.</div>
        {measured.length === 0 && <div className={ui.emptyLine}>Nothing measured yet. The first check opens {S.rules.measureDays[0]} days after a project is done.</div>}
        <div className={`${ui.list} ${ui.mt}`}>
          {measured.map((p) => (
            <div key={p.id} className={ui.listRow}>
              <div className={ui.between}>
                <Link href={href("/projects/" + p.id)} className={styles.link}>{projectLabel(p)} · {p.title}</Link>
                <VerdictChip verdict={p.verdict} />
              </div>
              {p.baseline && !p.baseline.none && <div className={ui.rowMeta}>{p.baseline.metric}, {p.baseline.better === "up" ? "higher" : "lower"} is better</div>}
              <div className={`${ui.chips} ${styles.moves}`}>
                {p.measures.map((m) => (
                  <span key={m.check} className={styles.move}>
                    <span className={styles.label}>{m.check} d</span> {movement(p.baseline, m)}
                    {m.changePct !== null && <span className={styles.change} data-verdict={m.verdict}>{changeText(m.changePct)}</span>}
                    <VerdictChip verdict={m.verdict} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={ui.card}>
        <div className={ui.h}>Wait ledger, after the yes</div>
        <div className={ui.sub}>Where projects wait. Counts only - nobody’s speed.</div>
        <div className={`${ui.grid2} ${ui.mt14}`}>
          <div className={ui.tile}><div className={ui.tileV}>{days(waits.started.medianDays)}</div><div className={ui.tileL}>decided → started · {waitSub(waits.started, "not started yet")}</div></div>
          <div className={ui.tile}><div className={ui.tileV}>{days(waits.measured.medianDays)}</div><div className={ui.tileL}>done → measured · {waitSub(waits.measured, "waiting for a first check")}</div></div>
          <div className={ui.tile}><div className={ui.tileV} data-hot={L.projectsEscalated ? "true" : undefined}>{L.projectsEscalated}</div><div className={ui.tileL}>late starts or measures moved to a deputy</div></div>
          <div className={ui.tile}><div className={ui.tileV} data-hot={L.measuresOwed ? "true" : undefined}>{L.measuresOwed}</div><div className={ui.tileL}>measures owed, past their due day</div></div>
          <div className={ui.tile}><div className={ui.tileV}>{L.unmeasured}</div><div className={ui.tileL}>done without a number (not measured)</div></div>
        </div>
      </div>
    </div>
  );
}
