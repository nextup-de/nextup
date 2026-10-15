"use client";
// The static demo's second half (features/ideas/demo-loop.ts): once the script's idea is published, a
// small player shows what happens next and plays it one step at a time - the discussion, version 2,
// the check-in, the yes, the project, two measures and the thanks - each step written into this
// browser's log as the person who would do it, then the page that shows it. Where the story stands
// is read from the log, so the app's own buttons can take a turn in between.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { appendEvent } from "@/features/cases/events";
import { LOOP_STEPS, nextLoopStep } from "@/features/ideas/demo-loop";
import { DEMO_SCRIPT } from "@/features/ideas/demo-script";
import { updateLog } from "@/lib/demo-log";
import styles from "./LoopPlayer.module.css";

export function LoopPlayer({ slug }: { slug: string }) {
  const { S, log, seed, href, flag } = useDemo();
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const script = S.cases.find((c) => !c.seed && c.title === DEMO_SCRIPT[0].say);
  if (!script || !flag("discussion") || !flag("projects")) return null;
  const next = nextLoopStep(S, log, script.id);
  if (!next) return null;
  if (hidden) {
    return (
      <button type="button" className={`nh-btn nh-btn-primary ${styles.reopen}`} onClick={() => setHidden(false)}>
        What happens next ▸
      </button>
    );
  }

  const manager = seed.personas.find((p) => p.id === "manager")?.who.name ?? "";
  const expert = seed.routes.find((r) => r.id === "r3")?.owner.name ?? "";
  const cast = { caseId: script.id, author: script.from, desk: script.assignee, expert, manager, projectId: next.projectId };

  const play = () => {
    const events = next.step.events(cast, next.project);
    updateLog(slug, (l) => events.reduce(appendEvent, l));
    router.push(href(next.step.go === "case" ? "/cases/" + encodeURIComponent(script.id) : "/projects/" + encodeURIComponent(next.projectId)));
  };

  return (
    <aside className={styles.player} aria-label="What happens next">
      <div className={styles.label}>
        <span>What happens next · {next.index + 1} of {LOOP_STEPS.length}</span>
        <button type="button" className={styles.hide} onClick={() => setHidden(true)}>Hide</button>
      </div>
      <p className={styles.say}>{next.step.say}</p>
      <div className={styles.row}>
        <div className={styles.dots} aria-hidden="true">
          {LOOP_STEPS.map((s, k) => <span key={s.key} className={styles.dot} data-done={k < next.index} data-now={k === next.index} />)}
        </div>
        <button type="button" className="nh-btn nh-btn-primary" onClick={play}>Play ▸</button>
      </div>
    </aside>
  );
}
