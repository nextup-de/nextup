"use client";
// Projects › Collaboration (Kevin, 16 Nov 2026), three lists of projects: the ones you work on but do not lead; the
// requests people outside a team sent to your projects or your unit's (help, resources, a handoff), open ones first;
// and the projects run across units, with the units as a column. A list with nothing in it is one quiet line, not an
// empty card; with nothing in any of them the page says so in one sentence (docs/DESIGN_RULES.md §1).
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { DataTable, DeptChip, SectionCard, ShowAll, useCapped } from "@/components/ui/elements";
import { crossUnitProjects, incomingRequests, worksOn, type IncomingRequest, type TeamPerson } from "@/features/projects/collab-view";
import { projectLabel } from "@/features/projects/selectors";
import { nextSteps } from "@/features/projects/tabs";
import type { ReducedProject } from "@/features/projects/types";
import { visibleProjectsFor } from "@/features/projects/views";
import { useT } from "@/i18n/client";
import { idViewerOf, peopleOf } from "../parts";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./Area.module.css";

const ref = (p: { id: string; number: number; title: string }) => projectLabel(p) + " · " + p.title;

export function Collaboration() {
  const ctx = useDemo();
  const t = useT();
  const { S, demo, ready, seed, persona, actorUserId } = ctx;
  if (!ready) return <PageSkeleton kind="list" />;
  const list = visibleProjectsFor(S, idViewerOf(ctx), demo);
  // A unit is a department. The org rows know people by their label; a seat links the label to a user id.
  const people = peopleOf(seed.seats);
  const unitOfName = (name: string) => seed.people.find((x) => x.name === name)?.dept ?? null;
  const unitOf = (who: TeamPerson) => unitOfName((who.userId !== null ? people.find((x) => x.userId === who.userId)?.name : null) ?? who.name);
  const myUnit = unitOf({ userId: actorUserId, name: persona.who.name }) ?? (persona.role.dept || null);

  const mine = worksOn(list, actorUserId);
  const asks = incomingRequests(list, { userId: actorUserId, unit: myUnit }, unitOf);
  const across = crossUnitProjects(list, unitOf);

  if (!mine.length && !asks.length && !across.length) {
    return <SectionCard><div className={ui.emptyLine}>{t("progress.collabEmpty")}</div></SectionCard>;
  }
  // The lists with something in them, in their order; then one quiet line for each empty one.
  const sections = [
    { name: "works-on", title: t("progress.collabWorksHead"), hint: t("progress.collabWorksSub"), empty: t("progress.collabWorksEmpty"), body: mine.length > 0 ? <WorksOn list={mine} /> : null },
    { name: "requests", title: t("progress.collabRequestsHead"), hint: t("progress.collabRequestsSub"), empty: t("progress.collabRequestsEmpty"), body: asks.length > 0 ? <Requests rows={asks} /> : null },
    { name: "across-units", title: t("progress.collabUnitsHead"), hint: t("progress.collabUnitsSub"), empty: t("progress.collabUnitsEmpty"), body: across.length > 0 ? <AcrossUnits rows={across} /> : null },
  ];
  return (
    <div className={styles.stack}>
      {sections.filter((x) => x.body).map((x) => <SectionCard key={x.name} title={x.title} hint={x.hint} name={x.name}>{x.body}</SectionCard>)}
      {sections.filter((x) => !x.body).map((x) => <p key={x.name} className={styles.quiet} data-name={x.name}>{x.empty}</p>)}
    </div>
  );
}

function WorksOn({ list }: { list: ReducedProject[] }) {
  const { href, actorUserId } = useDemo();
  const t = useT();
  const capped = useCapped(list);
  return (
    <>
      <ul className={styles.rows}>
        {capped.shown.map((p) => {
          const step = nextSteps(p.steps.filter((s) => !s.dropped && actorUserId !== null && s.ownerUserId === actorUserId), 1)[0];
          return (
            <li key={p.id} className={styles.row}>
              <div className={styles.rowMain}>
                <Link href={href("/projects/" + p.id)} className={styles.link}>{ref(p)}</Link>
                <span className={styles.status}>{t(("projects.status_" + p.status) as "projects.status_planning")}</span>
              </div>
              <div className={styles.meta}>
                <span>{t("projects.cardLead", { name: p.lead })}</span>
                {step && <span>{t("progress.collabYourStep", { text: step.text })}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <ShowAll list={capped} showAll={(count) => t("common.showAll", { count })} showLess={t("common.showLess")} />
    </>
  );
}

const STATE_KEY = {
  new: "projectRequests.requestStateNew", stepped: "projectRequests.requestStateStepped", declined: "projectRequests.requestStateDeclined",
} as const;

function Requests({ rows }: { rows: IncomingRequest[] }) {
  const { href, f, seed } = useDemo();
  const t = useT();
  const people = peopleOf(seed.seats);
  const capped = useCapped(rows);
  return (
    <>
      <ul className={styles.rows}>
        {capped.shown.map((r) => {
          const asker = (r.request.byUserId !== null ? people.find((x) => x.userId === r.request.byUserId)?.name : null) ?? t("projectRequests.inboxSomeone");
          const from = r.fromProjects[0];
          return (
            <li key={r.project.id + r.request.id} className={styles.row} data-open={r.request.state === "new" ? "true" : undefined}>
              <div className={styles.rowMain}>
                <span className={styles.what}>{r.what ?? r.formTitle ?? t("projectRequests.inboxSomeone")}</span>
                <span className={styles.status} data-tone={r.request.state === "new" ? "open" : undefined}>{t(STATE_KEY[r.request.state])}</span>
              </div>
              <div className={styles.meta}>
                <span>{asker}{from ? " · " + t("progress.collabRequestFrom", { project: ref(from) }) : ""}</span>
                <span>{r.byDay !== null ? t("progress.collabRequestBy", { date: f(r.byDay) }) : t("progress.collabRequestAsked", { date: f(r.request.day) })}</span>
                <Link href={href("/projects/" + r.project.id)} className={styles.link}>{t("progress.collabRequestTo", { project: ref(r.project) })}</Link>
              </div>
            </li>
          );
        })}
      </ul>
      <ShowAll list={capped} showAll={(count) => t("common.showAll", { count })} showLess={t("common.showLess")} />
    </>
  );
}

function AcrossUnits({ rows }: { rows: { project: ReducedProject; units: string[] }[] }) {
  const { href, deptName } = useDemo();
  const t = useT();
  const capped = useCapped(rows);
  return (
    <>
      <DataTable
        rows={capped.shown}
        rowKey={(r) => r.project.id}
        empty={t("progress.collabUnitsEmpty")}
        columns={[
          { key: "project", header: t("progress.collabColProject"), width: "minmax(0, 2fr)", render: (r) => <Link href={href("/projects/" + r.project.id)} className={styles.link}>{ref(r.project)}</Link> },
          { key: "units", header: t("progress.collabColUnits"), width: "minmax(0, 2fr)", render: (r) => <span className={styles.chips}>{r.units.map((u) => <DeptChip key={u} name={deptName(u)} />)}</span> },
          { key: "lead", header: t("progress.collabColLead"), width: "minmax(0, 1fr)", render: (r) => r.project.lead },
          { key: "status", header: t("progress.collabColStatus"), width: "minmax(0, 1fr)", render: (r) => t(("projects.status_" + r.project.status) as "projects.status_planning") },
        ]}
      />
      <ShowAll list={capped} showAll={(count) => t("common.showAll", { count })} showLess={t("common.showLess")} />
    </>
  );
}
