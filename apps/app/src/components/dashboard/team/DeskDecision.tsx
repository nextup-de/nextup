"use client";
// The desk's decision on an idea opened from Projects (Kevin, 16 Nov 2026): the same choices the inbox offers (yes, discuss,
// no, hand on, ask), in one row above the idea, so a team lead decides where they read it. The facts and what each button
// opens come from components/inbox/useOpenItem, so the inbox and this row never disagree.
import type { IdeaProps } from "@/components/dashboard/leader/IdeaParts";
import { Sparkle } from "@/components/dashboard/leader/IdeaParts";
import { useT } from "@/i18n/client";
import s from "./DeskDecision.module.css";

export function DeskDecision({ brief, status, onDecide }: Pick<IdeaProps, "brief" | "status" | "onDecide">) {
  const t = useT();
  if (!brief.actions.length) return null;
  return (
    <section className={s.bar} aria-label={t("leader.yourDecision")}>
      <div className={s.text}>
        <h2 className={s.title}>{t("leader.yourDecision")}</h2>
        {status && <p className={s.status}>{status.label}{status.sub ? " · " + status.sub : ""}</p>}
      </div>
      <div className={s.actions}>
        {brief.actions.map((d) => {
          const suggested = d.key === brief.rec;
          return (
            <button key={d.key} type="button" className={`nh-btn nh-btn-sm ${suggested ? "nh-btn-primary" : "nh-btn-secondary"}`} data-tone={d.danger ? "danger" : undefined}
              disabled={!d.live} onClick={() => onDecide(d.key)} title={d.live ? (suggested ? t("leader.aiSuggests") : undefined) : t("leader.decisionSoon")}>
              {suggested && <Sparkle size={10} />}{d.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
