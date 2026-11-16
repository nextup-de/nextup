"use client";
// The Ideas tab's "Mine": every idea I raised, one row each - what, open since, and where it stands in one line
// (features/ideas/status.ts). The title opens the idea page (/cases/<id>), the one home of an idea; an idea that became
// a project links to the project. With nothing raised, one sentence and the way to raise the first one.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { ShowAll, useCapped } from "@/components/ui/elements";
import { ideaStatusText, mineIdeas, type MineIdea } from "@/features/ideas/status";
import { formatDate } from "@/i18n/format";
import { useT } from "@/i18n/client";
import s from "./Mine.module.css";

export function MineView() {
  const t = useT();
  const ctx = useDemo();
  const { S, seed, me, href, ready, flag, locale } = ctx;
  const rows = mineIdeas(S, me.userId, { seats: seed.seats, roles: seed.roles ?? [], approvals: S.approvals }, seed.clock);
  const list = useCapped(rows);
  if (!ready) return <PageSkeleton kind="list" />;

  const since = (r: MineIdea) => (r.since.date ? formatDate(locale, new Date(r.since.date + "T12:00:00Z"), "dayMonth") : t("team.dashDaysShort", { n: r.since.days }));
  const status = (r: MineIdea) => {
    const text = ideaStatusText(r.status, t);
    if (r.status.kind === "project" && flag("projects")) return <Link href={href("/projects/" + encodeURIComponent(r.status.projectId))} className={s.project}>{text} →</Link>;
    return text;
  };

  return (
    <div className={s.page}>
      <h1 className="nh-sr">{t("ideas.mineTitle")}</h1>
      {rows.length === 0 ? (
        <p className={s.empty}>{t("ideas.mineEmpty")} <Link href={href("/raise")} className={s.emptyLink}>{t("ideas.mineRaiseFirst")}</Link></p>
      ) : (
        <div className={s.card}>
          <div className={s.head} aria-hidden="true">
            <span>{t("ideas.mineColWhat")}</span><span>{t("ideas.mineColSince")}</span><span>{t("ideas.mineColStatus")}</span>
          </div>
          <ul className={s.list} aria-label={t("ideas.mineTitle")}>
            {list.shown.map((r) => (
              <li key={r.id} className={s.row} data-status={r.status.kind} data-running={r.running ? "true" : undefined}>
                <span className={s.what}>
                  {r.problem && <span className={s.kind}>{t("team.ideaKindProblem")}</span>}
                  <Link href={href("/cases/" + encodeURIComponent(r.id))} className={s.title}>{r.title}</Link>
                </span>
                <span className={s.since}><span className="nh-sr">{t("ideas.mineColSince")} </span>{since(r)}</span>
                <span className={s.status}>{status(r)}</span>
              </li>
            ))}
          </ul>
          <ShowAll list={list} showAll={(count) => t("common.showAll", { count })} showLess={t("common.showLess")} className={s.more} />
        </div>
      )}
    </div>
  );
}
