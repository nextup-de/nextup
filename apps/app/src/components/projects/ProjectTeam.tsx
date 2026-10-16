"use client";
// Beside the board: who works on it (add, remove, hand over the lead), the tools the work lives in
// (Jira syncs through n8n; Azure DevOps, Planner, Teams, SharePoint, Polarion and codebeamer keep their
// links and keys), and - below the board - one activity feed: what was said and everything that
// happened, newest first.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Avatar } from "@/components/dashboard/shared/primitives";
import type { ReducedProject } from "@/features/projects/types";
import { connectionsOf, safeUrl, systemFrom, timelineOf, toolOf, type ToolId } from "@/features/projects/views";
import { useRights, useSend } from "./parts";
import styles from "./Projects.module.css";

export function TeamPanel({ p }: { p: ReducedProject }) {
  const { act, seed } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const [add, setAdd] = useState("");
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const live = p.status !== "stopped" && p.status !== "recognised";
  const team = [p.lead, ...p.members];
  const others = seed.people.map((x) => x.name).filter((n) => !team.includes(n));
  // How much of the board each person carries: open steps they own.
  const load = (n: string) => p.steps.filter((s) => s.owner === n && s.column !== "done").length;

  return (
    <section className={styles.railSection} aria-labelledby={"team-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"team-" + p.id} className={styles.h3}>Team</h2>
        <span className={styles.muted}>{team.length} {team.length === 1 ? "person" : "people"}</span>
      </div>
      <ul className={styles.people}>
        {team.map((m, k) => (
          <li key={m} className={styles.person}>
            <Avatar name={m} size="sm" />
            <span className={styles.grow}>{m}{k === 0 && <span className={styles.leadTag}>Lead</span>}</span>
            <span className={styles.load} title="Open steps they own">{load(m) ? load(m) + " open" : ""}</span>
            {k > 0 && r.lead && live && <button type="button" className={styles.quiet} onClick={() => send("project.member", { name: m }, () => act.project.member(p.id, m, false))} aria-label={"Take " + m + " off the team"}>Remove</button>}
          </li>
        ))}
      </ul>
      {r.lead && live && others.length > 0 && (
        <form className={styles.inline} onSubmit={(e) => { e.preventDefault(); if (add && send("project.member", { name: add }, () => act.project.member(p.id, add, true))) setAdd(""); }}>
          <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add to the team">
            <option value="">Add someone…</option>
            {others.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!add}>Add</button>
        </form>
      )}
      {r.hand && p.members.length > 0 && (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (to && send("project.handed", { to }, () => act.project.hand(p.id, to, why.trim() || undefined))) { setTo(""); setWhy(""); } }} aria-label="Hand over the lead">
          <select className={`nh-input nh-select ${styles.input}`} value={to} onChange={(e) => setTo(e.target.value)} aria-label="New lead">
            <option value="">Hand the lead to…</option>
            {p.members.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {to && <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why (optional)" aria-label="Why hand it over" />}
          {to && <span className={styles.actionRow}><button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm">Hand over the lead</button></span>}
        </form>
      )}
    </section>
  );
}

/** The tools the project's work lives in, and a way to connect one. */
export function ToolsPanel({ p }: { p: ReducedProject }) {
  const { act } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const rows = connectionsOf(p);
  const on = rows.filter((c) => c.links.length || c.steps);
  const [adding, setAdding] = useState<ToolId | null>(null);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [stepId, setStepId] = useState("");
  const [all, setAll] = useState(false);
  const stepText = (id: string | null) => (id ? p.steps.find((s) => s.id === id)?.text : undefined);
  const badUrl = url.trim() !== "" && !safeUrl(url);
  // The rows shown: every connected tool, and the rest only when asked for (or while one is being added).
  const visible = rows.filter((c) => c.links.length || c.steps || all || adding === c.tool.id);
  const startAdd = (id: ToolId) => { setAdding(id); setUrl(""); setKey(""); setStepId(""); };

  return (
    <section className={styles.railSection} aria-labelledby={"tools-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"tools-" + p.id} className={styles.h3}>Connected tools</h2>
        <span className={styles.muted}>{on.length ? on.length + " connected" : "none yet"}</span>
      </div>
      <ul className={styles.tools}>
        {visible.map((c) => {
          const synced = c.tool.sync === "sync";
          return (
            <li key={c.tool.id} className={styles.tool} data-on={c.links.length || c.steps ? "true" : undefined}>
              <span className={styles.toolMark} data-tool={c.tool.id} aria-hidden="true">{c.tool.short}</span>
              <div className={styles.toolBody}>
                <div className={styles.toolName}>
                  {c.tool.name}
                  <span className={styles.toolMode} data-sync={synced ? "true" : undefined}>{synced ? "Two-way sync" : "Link"}</span>
                </div>
                {c.links.length || c.steps ? (
                  <div className={styles.toolLinks}>
                    {c.links.map((l, k) => {
                      const label = l.key || (l.url ? shortUrl(l.url) : "link");
                      const onStep = stepText(l.stepId);
                      return (
                        <span key={k} className={styles.toolLink}>
                          {l.url ? <a href={l.url} target="_blank" rel="noreferrer noopener" className={styles.link}>{label}</a> : <span className={styles.strong}>{label}</span>}
                          <span className={styles.muted}>{onStep ? " · " + onStep : " · the project"}</span>
                        </span>
                      );
                    })}
                    {c.steps > 0 && <span className={styles.hint}>{c.steps} of {p.steps.length} steps have a ticket there</span>}
                  </div>
                ) : <div className={styles.hint}>{c.tool.what}</div>}
              </div>
              {r.link && adding !== c.tool.id && (
                <button type="button" className={styles.quietLink} onClick={() => startAdd(c.tool.id)} aria-label={(c.links.length ? "Add another link to " : "Connect ") + c.tool.name}>
                  {c.links.length ? "Add" : "Connect"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!all && rows.length > visible.length && (
        <button type="button" className={styles.quietLink} onClick={() => setAll(true)}>{on.length ? "More tools" : "Show the tools"} ({rows.length - visible.length})</button>
      )}
      {r.link && adding && (
        <form className={styles.form} aria-label={"Connect " + toolOf(adding).name} onSubmit={(e) => {
          e.preventDefault();
          if (badUrl) return;
          const k = key.trim();
          const u = url.trim();
          // The address decides the tool when it clearly names one; else the row it was added from.
          const system = u && systemFrom(u, k) !== "url" ? systemFrom(u, k) : adding;
          if (send("project.linked", { url: u, key: k }, () => act.project.link(p.id, u, system, k || undefined, stepId || undefined))) { setAdding(null); setAll(false); }
        }}>
          <div className={styles.formHead}>Connect {toolOf(adding).name}</div>
          <input className={`nh-input ${styles.input}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={placeholder(adding)} aria-label="Link address" aria-invalid={badUrl ? "true" : undefined} autoFocus />
          {badUrl && <span className="nh-error">Only http and https addresses.</span>}
          <span className={styles.inline}>
            <input className={`nh-input ${styles.input} ${styles.grow}`} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key, e.g. FS-12 (optional)" aria-label="Ticket key" />
            {p.steps.length > 0 && (
              <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={stepId} onChange={(e) => setStepId(e.target.value)} aria-label="For which step">
                <option value="">The whole project</option>
                {p.steps.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}
              </select>
            )}
          </span>
          <span className={styles.actionRow}>
            <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={(!url.trim() && !key.trim()) || badUrl}>Add the link</button>
            <button type="button" className={styles.quiet} onClick={() => setAdding(null)}>Cancel</button>
          </span>
        </form>
      )}
      <p className={styles.hint}>
        Jira syncs both ways through your company’s automation: a new step becomes an issue, and its status and comments come back here.
        The other tools keep the link and the keys; ask your admin to switch a sync on for them.
      </p>
    </section>
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
  const send = useSend(p);
  const [text, setText] = useState("");
  const [more, setMore] = useState(false);
  // The project's history holds every event in the order it happened, seed and live, comments too:
  // read backwards, it is the feed, newest first.
  const lines = new Map(timelineOf(p).map((l) => [l.id, l]));
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
        <h2 id={"activity-" + p.id} className={styles.h2}>Activity</h2>
        <span className={styles.muted}>{comments.length} {comments.length === 1 ? "comment" : "comments"} · {events.length} events</span>
      </div>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (send("project.commented", { text }, () => act.project.comment(p.id, text.trim()))) setText(""); }}>
        <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something to the team" aria-label="Comment" maxLength={2000} />
        {text.trim() && <span className={styles.actionRow}><button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">Comment</button></span>}
      </form>
      <ol className={styles.feed}>
        {shown.map((x) => x.kind === "comment" ? (
          <li key={x.id} className={styles.feedComment}>
            <Avatar name={x.by} size="sm" />
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
      {feed.length > 8 && <button type="button" className={styles.quietLink} onClick={() => setMore(!more)}>{more ? "Show less" : "Show all " + feed.length}</button>}
    </section>
  );
}
