"use client";
// Progress (Paper, "Progress · list"): every idea I raised, one row each - its stage and how far it is, when anything last
// happened to it, who has it now and the one status worth a chip. "Your move" keeps only the ideas waiting on me; the search
// finds one by its title. The title opens the idea page (/idea?id=<id>), the one home of an idea; an idea that became a
// project links to the project. With nothing raised, one sentence and the way to raise the first one.
import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { PersonFace, ShowAll, useCapped } from "@/components/ui/elements";
import { ideaStatusText, mineIdeas, type MineIdea, type Progress } from "@/features/ideas/status";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import s from "./Mine.module.css";
import { ideaPath } from "@/features/ideas/page-path";

const STAGE: Record<Progress["stage"], MessageKey> = {
  desk: "ideas.stageDesk", discussion: "ideas.stageDiscussion", sentBack: "ideas.stageSentBack", approving: "ideas.stageApproving",
  planning: "ideas.stagePlanning", running: "ideas.stageRunning", measuring: "ideas.stageMeasuring", recognised: "ideas.stageRecognised",
  stopped: "ideas.stageStopped", approved: "ideas.stageApproved", no: "ideas.stageNo", withdrawn: "ideas.stageWithdrawn", merged: "ideas.stageMerged",
};

export function MineView() {
  const t = useT();
  const ctx = useDemo();
  const { S, seed, me, href, ready, flag, f } = ctx;
  const [only, setOnly] = useState(false);
  const [q, setQ] = useState("");
  const all = mineIdeas(S, me.userId, { seats: seed.seats, roles: seed.roles ?? [], approvals: S.approvals }, seed.clock);
  const mine = all.filter((r) => r.progress.yourMove);
  const find = q.trim().toLowerCase();
  const rows = (only ? mine : all).filter((r) => !find || r.title.toLowerCase().includes(find));
  const list = useCapped(rows);
  if (!ready) return <PageSkeleton kind="list" />;

  const title = (r: MineIdea) => <Link href={href(ideaPath(r.id))} className={s.title}>{r.title}</Link>;
  const stage = (r: MineIdea) => {
    const p = r.progress;
    const label = t(STAGE[p.stage]);
    const text = p.count ? `${label} ${p.count.done}/${p.count.total}` : label;
    const inner = (
      <>
        <span>{text}</span>
        {p.count && <span className={s.bar} aria-hidden="true"><span style={{ width: `${(p.count.done / p.count.total) * 100}%` }} /></span>}
      </>
    );
    if (r.status.kind === "project" && flag("projects")) return <Link href={href("/projects/" + encodeURIComponent(r.status.projectId))} className={s.stage} aria-label={`${text} · ${ideaStatusText(r.status, t)}`}>{inner}</Link>;
    return <span className={s.stage} title={ideaStatusText(r.status, t)}>{inner}</span>;
  };
  const who = (p: Progress) => {
    if (p.with === "you") return <span className={s.who}>{t("ideas.progressYou")}</span>;
    if (!p.with.length) return null;
    return <span className={s.who}><PersonFace name={p.with[0]} size="sm" />{p.with[0]}{p.with.length > 1 && ` +${p.with.length - 1}`}</span>;
  };
  const chip = (p: Progress) => {
    if (!p.chip) return null;
    const key: Record<NonNullable<Progress["chip"]>["kind"], MessageKey> = { yourMove: "ideas.progressYourMove", blocked: "ideas.progressBlocked" };
    return <span className={s.chip} data-tone={p.chip.tone}>{t(key[p.chip.kind], { n: p.chip.n ?? 0 })}</span>;
  };

  if (all.length === 0) {
    return (
      <div className={s.page}>
        <h1 className="nh-sr">{t("ideas.mineTitle")}</h1>
        <p className={s.empty}>{t("ideas.mineEmpty")} <Link href={href("/raise")} className={s.emptyLink}>{t("ideas.mineRaiseFirst")}</Link></p>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <h1 className="nh-sr">{t("ideas.mineTitle")}</h1>
      <div className={s.bar1}>
        <div className={s.filters} role="group" aria-label={t("ideas.progressShow")}>
          <button type="button" className={s.filter} aria-pressed={!only} onClick={() => setOnly(false)}>{t("ideas.progressAll")} <span className={s.n}>{all.length}</span></button>
          <button type="button" className={s.filter} aria-pressed={only} onClick={() => setOnly(true)}>{t("ideas.progressYourMove")}{mine.length > 0 && <span className={s.n}> {mine.length}</span>}</button>
        </div>
        <input className={`nh-input ${s.search}`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ideas.progressSearch")} aria-label={t("ideas.progressSearch")} />
      </div>
      {rows.length === 0 ? (
        <p className={s.empty}>{t(only && !find ? "ideas.progressNoMove" : "ideas.progressNone")}</p>
      ) : (
        <div className={s.card}>
          <div className={s.head} aria-hidden="true">
            <span>{t("ideas.progressColName")}</span><span>{t("ideas.progressColStage")}</span><span>{t("ideas.progressColUpdated")}</span><span>{t("ideas.progressColWith")}</span><span className={s.end}>{t("ideas.mineColStatus")}</span>
          </div>
          <ul className={s.list} aria-label={t("ideas.mineTitle")}>
            {list.shown.map((r) => (
              <li key={r.id} className={s.row} data-status={r.status.kind} data-running={r.running ? "true" : undefined}>
                <span className={s.what}>
                  {r.problem && <span className={s.kind}>{t("team.ideaKindProblem")}</span>}
                  {title(r)}
                </span>
                {stage(r)}
                <span className={s.since}><span className="nh-sr">{t("ideas.progressColUpdated")} </span>{f(r.progress.updatedDay)}</span>
                {who(r.progress) ?? <span />}
                <span className={s.end}>{chip(r.progress)}</span>
              </li>
            ))}
          </ul>
          <ShowAll list={list} showAll={(count) => t("common.showAll", { count })} showLess={t("common.showLess")} className={s.more} />
        </div>
      )}
    </div>
  );
}
