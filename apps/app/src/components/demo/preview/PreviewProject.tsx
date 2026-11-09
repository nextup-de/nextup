"use client";
// /demo/preview/project: the project the yes opened. Overview: the setup checklist until the start, then
// what the agent's accepted suggestions led to. Board: the template's steps, each with a role and a due
// day. Agent: the suggestions a person accepts or dismisses, what the agent may do, and the ask box.
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Banner, PageHeader, PersonFace, ProgressBar, SectionCard, Tabs } from "@/components/ui/elements";
import { PREVIEW_DAY, PREVIEW_TABS, SETUP_ITEMS, canStart, missingSetup, openSuggestions, questionsAt, type Column, type PreviewTab, type SetupKey, type Suggestion } from "@/features/demo/preview/state";
import { PREVIEW_CASE, PREVIEW_DRAFT } from "@/features/demo/preview/story";
import { templateOf } from "@/features/demo/preview/templates";
import { useT } from "@/i18n/client";
import { usePreview } from "./PreviewProvider";
import styles from "./Preview.module.css";

const TAB_LABEL = { overview: "preview.tabOverview", board: "preview.tabBoard", agent: "preview.tabAgent" } as const;

export function PreviewProject({ tab }: { tab: PreviewTab }) {
  const { s } = usePreview();
  const { href } = useDemo();
  const t = useT();
  if (!s.decided) {
    return (
      <SectionCard title={t("preview.noProjectTitle")} hint={t("preview.noProjectText")}>
        <Link href={href("/preview/case")} className={styles.link}>{t("preview.backToCase")}</Link>
      </SectionCard>
    );
  }
  const template = s.decided.templateKey ? templateOf(s.decided.templateKey) : null;
  const waiting = openSuggestions(s).length;
  const counts: Partial<Record<PreviewTab, number>> = { board: s.steps.length, agent: s.started ? waiting : undefined };
  const base = href("/preview/project");
  return (
    <>
      <div className={styles.row}>
        <span className={styles.badge}>{t("preview.code")}</span>
        <span className={styles.badge} data-tone={s.started ? "ok" : "warn"}>{s.started ? t("preview.statusRunning", { day: PREVIEW_DAY }) : t("preview.statusSetup")}</span>
        <span className={styles.badge} data-tone="brand">{template ? t("preview.templateBadge", { name: template.name }) : t("preview.sheetNone")}</span>
      </div>
      <PageHeader title={PREVIEW_CASE.title}
        action={<span className={styles.metaRow}><PersonFace name={PREVIEW_CASE.owner} size="sm" />{t("preview.leadLine", { name: PREVIEW_CASE.owner })}</span>} />
      <Tabs label={t("preview.tabsLabel")} current={tab}
        items={PREVIEW_TABS.map((k) => ({ key: k, label: t(TAB_LABEL[k]), href: k === "overview" ? base : base + "?tab=" + k, count: counts[k] }))} />
      {tab === "overview" && <Overview />}
      {tab === "board" && <Board />}
      {tab === "agent" && <Agent />}
    </>
  );
}

// ── Overview ──

/** What the agent's draft says about a setup item, when the yes took the draft along. */
const DRAFT_FOR: Partial<Record<SetupKey, string>> = {
  team: PREVIEW_DRAFT.team.slice(0, 3).join(" · "),
  roles: PREVIEW_DRAFT.team[3],
  goal: PREVIEW_DRAFT.goal,
  baseline: PREVIEW_DRAFT.metric,
};

function Overview() {
  const { s, send } = usePreview();
  const { href } = useDemo();
  const t = useT();
  if (s.started) {
    const waiting = openSuggestions(s).length;
    const report = s.suggestions.find((x) => x.kind === "report");
    const nudge = s.suggestions.find((x) => x.kind === "unblock");
    const count = (column: Column) => s.steps.filter((x) => x.column === column).length;
    return (
      <div className={styles.stack}>
        <Banner tone="info" action={waiting > 0 ? <Link href={href("/preview/project?tab=agent")} className={styles.link}>{t("preview.seeAgent")}</Link> : undefined}>
          {t("preview.jumped", { day: PREVIEW_DAY })}{waiting > 0 ? " " + t("preview.waiting", { count: waiting }) : ""}
        </Banner>
        <SectionCard title={t("preview.standsTitle")} hint={t("preview.standsLine", { done: count("done"), total: s.steps.length })}>
          <ProgressBar done={count("done")} doing={count("doing")} open={count("todo")} label={t("preview.standsTitle")} />
        </SectionCard>
        {report && s.answers.report === "accepted" && (
          <SectionCard title={t("preview.updateTitle")}><p className={styles.text}>{report.draft}</p></SectionCard>
        )}
        {nudge?.role && s.answers.unblock === "accepted" && <p className={styles.meta}>{t("preview.noticeSent", { role: nudge.role })}</p>}
      </div>
    );
  }
  const missing = missingSetup(s);
  return (
    <SectionCard title={t("preview.setupTitle")} hint={t("preview.setupHint")}>
      <ul className={styles.rows}>
        {SETUP_ITEMS.map(({ key, required }) => {
          const mark = s.setup[key];
          const draft = s.decided?.withDraft ? DRAFT_FOR[key] : undefined;
          return (
            <li key={key} className={styles.check} data-mark={mark}>
              <span className={styles.body}>
                <span className={styles.row}>
                  <span className={styles.strong}>{t(("preview.setup_" + key) as "preview.setup_team")}</span>
                  {required && <span className={styles.badge}>{t("preview.needed")}</span>}
                </span>
                <span className={styles.meta}>{t(("preview.setupWhat_" + key) as "preview.setupWhat_team")}</span>
                {draft && <span className={styles.draft}><span className={styles.strong}>{t("preview.fromDraft")}</span> {draft}</span>}
              </span>
              <span className={styles.checkActions}>
                {mark ? (
                  <>
                    <span className={styles.badge} data-tone={mark === "done" ? "ok" : undefined}>{mark === "done" ? t("preview.stateDone") : t("preview.stateNa")}</span>
                    <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => send({ type: "setup", key, mark: null })}>{t("preview.undo")}</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="nh-btn nh-btn-secondary nh-btn-sm" onClick={() => send({ type: "setup", key, mark: "done" })}>{t("preview.markDone")}</button>
                    {!required && <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => send({ type: "setup", key, mark: "na" })}>{t("preview.markNa")}</button>}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={styles.row}>
        <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!canStart(s)} onClick={() => send({ type: "start" })}>{t("preview.start")}</button>
        {missing.length > 0 && <span className={styles.meta}>{t("preview.startNeeds", { items: missing.map((k) => t(("preview.setup_" + k) as "preview.setup_team")).join(", ") })}</span>}
      </div>
    </SectionCard>
  );
}

// ── Board ──

const COLUMNS: readonly (readonly [Column, "preview.boardTodo" | "preview.boardDoing" | "preview.boardDone"])[] = [
  ["todo", "preview.boardTodo"], ["doing", "preview.boardDoing"], ["done", "preview.boardDone"],
];

function Board() {
  const { s, send } = usePreview();
  const t = useT();
  return (
    <div className={styles.stack}>
      {!s.started && <p className={styles.meta}>{t("preview.boardBeforeStart")}</p>}
      <div className={styles.board}>
        {COLUMNS.map(([column, label]) => {
          const steps = s.steps.filter((x) => x.column === column);
          return (
            <section key={column} className={styles.column} aria-label={t(label)}>
              <div className={styles.columnHead}><span>{t(label)}</span><span>{steps.length}</span></div>
              {steps.length === 0 && <p className={styles.meta}>{t("preview.boardEmpty")}</p>}
              {steps.map((x) => (
                <div key={x.id} className={styles.step}>
                  <span>{x.title}</span>
                  <span className={styles.meta}>{t("preview.stepLine", { role: x.role, day: x.dueDay })}</span>
                  {x.fromAgent && <span className={styles.badge} data-tone="ai">{t("preview.byAgent")}</span>}
                  {s.started && column !== "done" && <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => send({ type: "move", stepId: x.id })}>{t("preview.move")}</button>}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ── Agent ──

const RIGHTS = [["read", true], ["draft", true], ["suggest", true], ["send", false], ["move", false]] as const;

function Agent() {
  const { s } = usePreview();
  const t = useT();
  const [asked, setAsked] = useState<number | null>(null);
  if (!s.started) return <Banner tone="quiet">{t("preview.agentBeforeStart")}</Banner>;
  const answered = Object.values(s.answers);
  const questions = questionsAt(s.steps);
  return (
    <div className={styles.layout}>
      <SectionCard title={t("preview.agentTitle")} hint={t("preview.agentHint")}
        action={answered.length > 0 ? <span className={styles.badge}>{t("preview.share", { accepted: answered.filter((a) => a === "accepted").length, answered: answered.length })}</span> : undefined}>
        {s.suggestions.map((x) => <SuggestionCard key={x.kind} x={x} />)}
      </SectionCard>
      <div className={styles.stack}>
        <SectionCard title={t("preview.askTitle")}>
          <div className={styles.row}>
            {questions.map((x, k) => <button key={x.q} type="button" className={styles.chipButton} aria-pressed={asked === k} onClick={() => setAsked(k)}>{x.q}</button>)}
          </div>
          {asked !== null && <p className={styles.draft}><span className={styles.strong}>{t("preview.aiDraft")}:</span> {questions[asked].a}</p>}
        </SectionCard>
        <SectionCard title={t("preview.rightsTitle")}>
          <ul className={styles.list}>
            {RIGHTS.map(([right, on]) => (
              <li key={right}>
                <span>{t(("preview.right_" + right) as "preview.right_read")}</span>
                <span className={styles.badge} data-tone={on ? "ok" : undefined}>{on ? t("preview.rightOn") : t("preview.rightOff")}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function SuggestionCard({ x }: { x: Suggestion }) {
  const { s, send } = usePreview();
  const t = useT();
  const answer = s.answers[x.kind];
  return (
    <article className={styles.suggestion} data-answer={answer}>
      <div className={styles.row}>
        <span className={styles.badge} data-tone="ai">{t(("preview.kind_" + x.kind) as "preview.kind_plan")}</span>
        <span className={styles.strong}>{x.title}</span>
      </div>
      <p className={styles.meta}>{x.why}</p>
      <p className={styles.draft}>{x.draft}</p>
      {answer ? (
        <div className={styles.row}>
          <span className={styles.badge} data-tone={answer === "accepted" ? "ok" : undefined}>{answer === "accepted" ? t("preview.accepted") : t("preview.dismissed")}</span>
          {answer === "accepted" && <span className={styles.meta}>{t(("preview.effect_" + x.kind) as "preview.effect_plan", { role: x.role ?? "" })}</span>}
        </div>
      ) : (
        <div className={styles.row}>
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => send({ type: "answer", kind: x.kind, answer: "accepted" })}>{t("preview.accept")}</button>
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => send({ type: "answer", kind: x.kind, answer: "dismissed" })}>{t("preview.dismiss")}</button>
        </div>
      )}
    </article>
  );
}
