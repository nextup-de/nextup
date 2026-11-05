"use client";
// Beside the board: who works on it (add, remove, hand over the lead), the tools the work lives in
// (Jira syncs from the app once the company's admin switched it on; Azure DevOps, Planner, Teams,
// SharePoint, Polarion and codebeamer keep their links and keys), and - below the board - one activity feed: what was said and everything that
// happened, newest first.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DeptChip, PersonFace } from "@/components/ui/elements";
import { isIssueKey, jiraIssueUrl } from "@/features/integrations/jira/settings";
import type { ReducedProject } from "@/features/projects/types";
import { connectionsOf, safeUrl, systemFrom, timelineOf, toolName, toolOf, toolWhat, type JiraRow, type ToolId } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { peopleOf, teamOf, useRights, useSend, withIds } from "./parts";
import styles from "./Projects.module.css";

export function TeamPanel({ p }: { p: ReducedProject }) {
  const { act, seed } = useDemo();
  const t = useT();
  const r = useRights(p);
  const send = useSend(p);
  const [add, setAdd] = useState("");
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const live = p.status !== "stopped" && p.status !== "recognised";
  const team = teamOf(p, seed.seats);
  // The department the company's org chart gives a person; nobody on the chart, no chip.
  const deptOf = (name: string) => seed.people.find((x) => x.name === name)?.dept ?? "";
  const onTeam = new Set(team.map((m) => m.userId));
  const others = peopleOf(seed.seats).filter((x) => !onTeam.has(x.userId));
  // How much of the board each person carries: open steps they own.
  const load = (userId: string | null) => userId === null ? 0 : p.steps.filter((s) => s.ownerUserId === userId && s.column !== "done").length;

  return (
    <section className={styles.railSection} aria-labelledby={"team-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"team-" + p.id} className={styles.h3}>{t("projects.teamTitle")}</h2>
        <span className={styles.muted}>{t("projects.peopleCount", { count: team.length })}</span>
      </div>
      <ul className={styles.people}>
        {team.map((m, k) => (
          <li key={m.userId ?? m.name} className={styles.person}>
            <PersonFace name={m.name} size="sm" />
            <span className={styles.grow}>{m.name}{k === 0 && <span className={styles.leadTag}>{t("projects.leadTag")}</span>}</span>
            {deptOf(m.name) ? <DeptChip name={deptOf(m.name)} /> : null}
            <span className={styles.load} title={t("projects.openStepsTheyOwn")}>{load(m.userId) ? t("projects.openCount", { count: load(m.userId) }) : ""}</span>
            {k > 0 && m.userId !== null && r.lead && live && <button type="button" className={styles.quiet} onClick={() => send("project.member", { userId: m.userId as string, name: m.name }, () => act.project.member(p.id, { userId: m.userId as string, name: m.name }, false))} aria-label={t("projects.takeOffTeam", { name: m.name })}>{t("projects.remove")}</button>}
          </li>
        ))}
      </ul>
      {r.lead && live && others.length > 0 && (
        <form className={styles.inline} onSubmit={(e) => { e.preventDefault(); const who = others.find((x) => x.userId === add); if (who && send("project.member", { userId: who.userId, name: who.name }, () => act.project.member(p.id, who, true))) setAdd(""); }}>
          <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={add} onChange={(e) => setAdd(e.target.value)} aria-label={t("projects.addToTeam")}>
            <option value="">{t("projects.addSomeone")}</option>
            {others.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}
          </select>
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!add}>{t("projects.add")}</button>
        </form>
      )}
      {r.hand && withIds(team.slice(1)).length > 0 && (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); const next = withIds(team.slice(1)).find((x) => x.userId === to); if (next && send("project.handed", { toUserId: next.userId, to: next.name }, () => act.project.hand(p.id, next, why.trim() || undefined))) { setTo(""); setWhy(""); } }} aria-label={t("projects.handOver")}>
          <select className={`nh-input nh-select ${styles.input}`} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("projects.newLead")}>
            <option value="">{t("projects.handTo")}</option>
            {withIds(team.slice(1)).map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}
          </select>
          {to && <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("projects.whyOptional")} aria-label={t("projects.whyHandOver")} />}
          {to && <span className={styles.actionRow}><button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm">{t("projects.handOver")}</button></span>}
        </form>
      )}
    </section>
  );
}

/** The tools the project's work lives in, and a way to connect one. */
export function ToolsPanel({ p, jira }: { p: ReducedProject; jira: JiraRow }) {
  const { act } = useDemo();
  const t = useT();
  const locale = useLocale();
  const r = useRights(p);
  const send = useSend(p);
  const rows = connectionsOf(p);
  const on = rows.filter((c) => c.links.length || c.steps);
  const [adding, setAdding] = useState<ToolId | null>(null);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [stepId, setStepId] = useState("");
  const [all, setAll] = useState(false);
  // Send to Jira and Stop syncing are the lead's (or a manager's): the same rule the server checks for project.sync.
  const mayShare = r.check("project.sync", { system: "jira", on: true }).ok;
  const stepText = (id: string | null) => (id ? p.steps.find((s) => s.id === id)?.text : undefined);
  const badUrl = url.trim() !== "" && !safeUrl(url);
  // The rows shown: every connected tool, and the rest only when asked for (or while one is being added).
  // Jira stays in view once the company's sync is on: Send to Jira is the lead's first move.
  const visible = rows.filter((c) => c.links.length || c.steps || all || adding === c.tool.id || (c.tool.id === "jira" && jira.state !== "off"));
  const startAdd = (id: ToolId) => { setAdding(id); setUrl(""); setKey(""); setStepId(""); };

  return (
    <section className={styles.railSection} aria-labelledby={"tools-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"tools-" + p.id} className={styles.h3}>{t("projects.toolsTitle")}</h2>
        <span className={styles.muted}>{on.length ? t("projects.toolsConnected", { count: on.length }) : t("projects.toolsNone")}</span>
      </div>
      <ul className={styles.tools}>
        {visible.map((c) => {
          const isJira = c.tool.id === "jira";
          // Jira's mode follows the company: "Link" until the admin switches the sync on. Other tools only link.
          const mode = isJira ? jira.label : t("projects.jiraLink");
          return (
            <li key={c.tool.id} className={styles.tool} data-on={c.links.length || c.steps ? "true" : undefined}>
              <span className={styles.toolMark} data-tool={c.tool.id} aria-hidden="true">{c.tool.short}</span>
              <div className={styles.toolBody}>
                <div className={styles.toolName}>
                  {toolName(c.tool, locale)}
                  <span className={styles.toolMode} data-sync={isJira && jira.state !== "off" ? "true" : undefined}>{mode}</span>
                </div>
                {c.links.length || c.steps ? (
                  <div className={styles.toolLinks}>
                    {c.links.map((l, k) => {
                      const label = l.key || (l.url ? shortUrl(l.url) : t("projects.linkWord"));
                      const onStep = stepText(l.stepId);
                      return (
                        <span key={k} className={styles.toolLink}>
                          {l.url ? <a href={l.url} target="_blank" rel="noreferrer noopener" className={styles.link}>{label}</a> : <span className={styles.strong}>{label}</span>}
                          <span className={styles.muted}>{onStep ? " · " + onStep : " · " + t("projects.theProject")}</span>
                        </span>
                      );
                    })}
                    {c.steps > 0 && <span className={styles.hint}>{t("projects.stepsHaveTicket", { count: c.steps, total: p.steps.length })}</span>}
                  </div>
                ) : <div className={styles.hint}>{toolWhat(c.tool, locale)}</div>}
                {isJira && <JiraControls p={p} jira={jira} mayShare={mayShare} />}
              </div>
              {r.link && adding !== c.tool.id && (
                <button type="button" className={styles.quietLink} onClick={() => startAdd(c.tool.id)} aria-label={c.links.length ? t("projects.addAnotherLinkTo", { tool: toolName(c.tool, locale) }) : t("projects.connectTool", { tool: toolName(c.tool, locale) })}>
                  {c.links.length ? t("projects.add") : t("projects.connect")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!all && rows.length > visible.length && (
        <button type="button" className={styles.quietLink} onClick={() => setAll(true)}>{on.length ? t("projects.moreTools") : t("projects.showTools")} ({rows.length - visible.length})</button>
      )}
      {r.link && adding === "jira" && jira.canLink && <JiraLinkForm p={p} jira={jira} onDone={() => { setAdding(null); setAll(false); }} />}
      {r.link && adding && !(adding === "jira" && jira.canLink) && (
        <form className={styles.form} aria-label={t("projects.connectTool", { tool: toolName(toolOf(adding), locale) })} onSubmit={(e) => {
          e.preventDefault();
          if (badUrl) return;
          const k = key.trim();
          const u = url.trim();
          // The address decides the tool when it clearly names one; else the row it was added from.
          const system = u && systemFrom(u, k) !== "url" ? systemFrom(u, k) : adding;
          if (send("project.linked", { url: u, key: k }, () => act.project.link(p.id, u, system, k || undefined, stepId || undefined))) { setAdding(null); setAll(false); }
        }}>
          <div className={styles.formHead}>{t("projects.connectTool", { tool: toolName(toolOf(adding), locale) })}</div>
          <input className={`nh-input ${styles.input}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={placeholder(adding)} aria-label={t("projects.linkAddress")} aria-invalid={badUrl ? "true" : undefined} autoFocus />
          {badUrl && <span className="nh-error">{t("projects.onlyHttp")}</span>}
          <span className={styles.inline}>
            <input className={`nh-input ${styles.input} ${styles.grow}`} value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("projects.ticketKeyOptional")} aria-label={t("projects.ticketKey")} />
            {p.steps.length > 0 && (
              <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={stepId} onChange={(e) => setStepId(e.target.value)} aria-label={t("projects.forWhichStep")}>
                <option value="">{t("projects.wholeProject")}</option>
                {p.steps.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}
              </select>
            )}
          </span>
          <span className={styles.actionRow}>
            <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={(!url.trim() && !key.trim()) || badUrl}>{t("projects.addLink")}</button>
            <button type="button" className={styles.quiet} onClick={() => setAdding(null)}>{t("common.cancel")}</button>
          </span>
        </form>
      )}
      <p className={styles.hint}>
        {(jira.state === "off" ? t("projects.toolsHintOff") : t("projects.toolsHintOn")) + " " + t("projects.toolsHintOthers")}
      </p>
    </section>
  );
}

/** Under Jira's name: what the sync is doing for this project, and the lead's way to start or stop it. */
function JiraControls({ p, jira, mayShare }: { p: ReducedProject; jira: JiraRow; mayShare: boolean }) {
  const { act } = useDemo();
  const t = useT();
  const send = useSend(p);
  const share = (on: boolean) => send("project.sync", { system: "jira", on }, () => act.project.sync(p.id, on));
  return (
    <>
      {jira.state === "off" && <div className={styles.hint}>{jira.hint}</div>}
      {jira.state === "ready" && (
        <>
          {mayShare && <span className={styles.actionRow}><button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => share(true)}>{jira.send}</button></span>}
          <div className={styles.hint}>{jira.hint}</div>
        </>
      )}
      {jira.state === "synced" && jira.chip && (
        <span className={styles.actionRow}>
          <span className={styles.syncChip} data-tone={jira.chip.tone} role="status">{jira.chip.text}</span>
          {mayShare && <button type="button" className={styles.quietLink} onClick={() => share(false)}>{t("projects.stopSyncing")}</button>}
        </span>
      )}
    </>
  );
}

/** Link an existing Jira issue to a step (or the project): its key and the step, the address built from the site's. */
function JiraLinkForm({ p, jira, onDone }: { p: ReducedProject; jira: JiraRow; onDone: () => void }) {
  const { act } = useDemo();
  const t = useT();
  const send = useSend(p);
  const [key, setKey] = useState("");
  const [stepId, setStepId] = useState("");
  const k = key.trim().toUpperCase();
  const bad = k !== "" && !isIssueKey(k);
  const siteUrl = jira.siteUrl ?? "";
  const example = (jira.projectKey ?? "NUP") + "-12";
  return (
    <form className={styles.form} aria-label={t("projects.linkJiraIssueLabel")} onSubmit={(e) => {
      e.preventDefault();
      if (!isIssueKey(k)) return;
      const url = jiraIssueUrl({ siteUrl }, k);
      if (send("project.linked", { system: "jira", key: k, url, stepId: stepId || undefined }, () => act.project.link(p.id, url, "jira", k, stepId || undefined))) onDone();
    }}>
      <div className={styles.formHead}>{t("projects.linkJiraIssue")}</div>
      <span className={styles.inline}>
        <input className={`nh-input ${styles.input} ${styles.grow}`} value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("projects.issueKeyPlaceholder", { example })} aria-label={t("projects.jiraIssueKey")} aria-invalid={bad ? "true" : undefined} autoFocus />
        <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={stepId} onChange={(e) => setStepId(e.target.value)} aria-label={t("projects.forWhichStep")}>
          <option value="">{t("projects.wholeProject")}</option>
          {p.steps.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}
        </select>
      </span>
      {bad && <span className="nh-error">{t("projects.jiraKeyLooksLike", { example })}</span>}
      <span className={styles.hint}>{t("projects.stepTakesStatus")}</span>
      <span className={styles.actionRow}>
        <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!isIssueKey(k)}>{t("projects.linkIssue")}</button>
        <button type="button" className={styles.quiet} onClick={onDone}>{t("common.cancel")}</button>
      </span>
    </form>
  );
}

const PLACEHOLDER: Partial<Record<ToolId, string>> = {
  jira: "https://yours.atlassian.net/browse/FS-12",
  azure: "https://dev.azure.com/org/project/_workitems/edit/123",
  planner: "https://planner.cloud.microsoft/…",
  teams: "https://teams.microsoft.com/l/channel/…",
  sharepoint: "https://yours.sharepoint.com/sites/…",
};
const placeholder = (id: ToolId) => PLACEHOLDER[id] ?? "https://…";

/** "teams.microsoft.com/…/field-service-offline": the host and the last part of the path. */
function shortUrl(url: string): string {
  const [host = url, ...path] = url.replace(/^https?:\/\//i, "").split(/[?#]/)[0].split("/").filter(Boolean);
  const last = path[path.length - 1];
  return !last ? host : path.length > 1 ? host + "/…/" + last : host + "/" + last;
}

type FeedItem = { kind: "comment" | "event"; id: string; by: string; text: string; day: number };

/** What was said and what happened, in one feed: newest first, with the box to say something on top. */
export function ActivityPanel({ p }: { p: ReducedProject }) {
  const { act, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const send = useSend(p);
  const [text, setText] = useState("");
  const [more, setMore] = useState(false);
  // The project's history holds every event in the order it happened, seed and live, comments too:
  // read backwards, it is the feed, newest first.
  const lines = new Map(timelineOf(p, locale).map((l) => [l.id, l]));
  const feed = p.history.slice().reverse().flatMap((e): FeedItem[] => {
    if (e.type === "project.commented") return [{ kind: "comment", id: e.id, by: e.actor, text: e.payload.text ?? "", day: e.day }];
    const l = lines.get(e.id);
    return l ? [{ kind: "event", ...l }] : [];
  });
  const comments = feed.filter((x) => x.kind === "comment");
  const events = feed.filter((x) => x.kind === "event");
  const shown = more ? feed : feed.slice(0, 8);

  return (
    <section className={`${styles.panel} ${styles.activity}`} aria-labelledby={"activity-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"activity-" + p.id} className={styles.h2}>{t("projects.activityTitle")}</h2>
        <span className={styles.muted}>{t("projects.commentCount", { count: comments.length })} · {t("projects.eventCount", { count: events.length })}</span>
      </div>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (send("project.commented", { text }, () => act.project.comment(p.id, text.trim()))) setText(""); }}>
        <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("projects.commentPlaceholder")} aria-label={t("projects.comment")} maxLength={2000} />
        {text.trim() && <span className={styles.actionRow}><button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">{t("projects.comment")}</button></span>}
      </form>
      <ol className={styles.feed}>
        {shown.map((x) => x.kind === "comment" ? (
          <li key={x.id} className={styles.feedComment}>
            <PersonFace name={x.by} size="sm" />
            <span className={styles.feedBody}>
              <span className={styles.commentBy}>{x.by} · {f(x.day)}</span>
              <span>{x.text}</span>
            </span>
          </li>
        ) : (
          <li key={x.id} className={styles.tl}>
            <span className={styles.tlDay}>{f(x.day)}</span>
            <span><span className={styles.strong}>{x.by}</span> {x.text}</span>
          </li>
        ))}
      </ol>
      {feed.length > 8 && <button type="button" className={styles.quietLink} onClick={() => setMore(!more)}>{more ? t("projects.showLess") : t("projects.showAll", { count: feed.length })}</button>}
    </section>
  );
}
