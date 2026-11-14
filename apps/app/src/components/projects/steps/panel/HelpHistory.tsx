"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useCaseNames } from "@/components/cases/useCaseNames";
import { newId } from "@/features/cases/events";
import { helpView } from "@/features/projects/measure-view";
import { HELP_TEXT_MAX } from "@/features/projects/result";
import type { ReducedProject, Step } from "@/features/projects/types";
import { timelineOf } from "@/features/projects/views";
import { appendEventAction } from "@/server/actions/events";
import { useLocale, useT } from "@/i18n/client";
import { idViewerOf, useSend } from "../../parts";
import styles from "./Panel.module.css";

/** Same help rules and timeline as StepDetail; the legacy component stays untouched. */
export function HelpHistory({ p, step }: { p: ReducedProject; step: Step }) {
  const ctx = useDemo();
  const { act, S, f, serverMode, tenant, showToast } = ctx;
  const router = useRouter();
  const names = useCaseNames();
  const t = useT();
  const locale = useLocale();
  const send = useSend(p);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const help = helpView(p, step, S, idViewerOf(ctx), names.roleTitle, locale);
  const ids = new Set(p.history.filter((e) => e.payload?.stepId === step.id).map((e) => e.id));
  const story = timelineOf(p, locale).filter((l) => ids.has(l.id));
  return <>
    {(help.canAsk || help.asks.length > 0) && <section className={styles.section} data-testid="step-help">
      {help.asks.map((a, i) => <p key={p.helpAsks.filter((ask) => ask.stepId === step.id)[i]?.id ?? i} className={styles.note}>
        {t("projectResult.askSponsorSent", { who: a.toName, date: f(a.day) })}: {a.text}
        {a.answeredDay !== null && " · " + t("projectResult.askSponsorAnswered", { date: f(a.answeredDay) })}
      </p>)}
      {help.canAsk && !asking && <button type="button" className={styles.link} onClick={() => setAsking(true)}>{t("projectResult.askSponsor")}</button>}
      {help.canAsk && asking && <form className={styles.composer} aria-label={t("projectResult.askSponsor")} onSubmit={(e) => {
        e.preventDefault();
        const body = text.trim();
        if (!body) return;
        const payload = { stepId: step.id, text: body };
        if (send("project.help.asked", payload, () => {
          if (!serverMode) { act.project.askHelp(p.id, step.id, body); return; }
          void appendEventAction({ slug: tenant.slug, id: newId("e"), type: "project.help.asked", target: p.id, payload }).then((res) => {
            if (res.ok) router.refresh(); else showToast(res.error);
          });
        })) { setText(""); setAsking(false); }
      }} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAsking(false); } }}>
        <textarea className="nh-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={HELP_TEXT_MAX} aria-label={t("projectResult.askSponsorText")} autoFocus />
        <div className={styles.row}>
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!text.trim()}>{t("projectResult.askSponsorSend")}</button>
          <button type="button" className={styles.link} onClick={() => { setAsking(false); setText(""); }}>{t("projectSteps.cancel")}</button>
        </div>
      </form>}
    </section>}
    {story.length > 0 && <section className={styles.section} aria-label={t("projects.history")}>
      <h3>{t("projects.history")}</h3>
      <ol className={styles.history}>{story.map((l) => <li key={l.id}><span className={styles.hint}>{f(l.day)}</span><span><strong>{l.by}</strong> {l.text}</span></li>)}</ol>
    </section>}
  </>;
}
