"use client";
// /admin/integrations (company stack): the Jira connection. Client because the Test button has to
// keep what was typed (React resets an uncontrolled form after an action) and fills the issue-type
// dropdowns from its answer. The API token is typed here, goes to the server, and never comes back:
// the page is only told that one is saved.
import { useState, useTransition } from "react";
import { Field } from "@/components/ui/Field";
import { ago, jiraHeadline, suggestTypes, type JiraForm } from "@/features/admin/jira-admin";
import { STEP_COLUMNS, type StepColumn } from "@/features/projects/types";
import { CATEGORY_FOR, type JiraIssueType } from "@/features/integrations/jira/types";
import {
  newWebhookSecretAction,
  removeJiraAction,
  removeWebhookSecretAction,
  saveJiraAction,
  setJiraOnAction,
  syncJiraNowAction,
  testJiraAction,
  type JiraActionState,
  type JiraTestState,
} from "@/server/actions/jira-admin";
import type { JiraAdminView } from "@/server/jira-admin";
import styles from "@/app/admin/admin.module.css";

const COLUMN_LABEL: Record<StepColumn, string> = { todo: "To do", doing: "Doing", blocked: "Blocked", done: "Done" };
const CATEGORY_LABEL = { new: "To Do", indeterminate: "In Progress", done: "Done" } as const;

const day = (iso: string) => iso.slice(0, 10);

export function JiraAdmin({ view }: { view: JiraAdminView }) {
  const { status: st } = view;
  const now = new Date(view.now);
  const [form, setForm] = useState<JiraForm>({ ...view.form, token: "" });
  const [types, setTypes] = useState<JiraIssueType[]>([]);
  const [test, setTest] = useState<JiraTestState | null>(null);
  const [note, setNote] = useState<JiraActionState | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof JiraForm>(k: K, v: JiraForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const run = (fn: () => Promise<void>) => { setNote(null); start(fn); };
  const act = (fn: () => Promise<JiraActionState>) => run(async () => setNote(await fn()));

  const onTest = () => run(async () => {
    const r = await testJiraAction(form);
    setTest(r);
    if (r.issueTypes.length) {
      setTypes(r.issueTypes);
      const sug = suggestTypes(r.issueTypes);
      setForm((f) => ({ ...f, epicTypeId: f.epicTypeId || sug.epicTypeId, stepTypeId: f.stepTypeId || sug.stepTypeId }));
    }
  });
  const onSecret = () => run(async () => {
    const r = await newWebhookSecretAction();
    setSecret(r.secret ?? null);
    setNote(r.error ? { error: r.error } : null);
  });

  const headline = jiraHeadline(st, now);
  const typeOptions = (current: string): JiraIssueType[] => {
    if (!current || types.some((t) => t.id === current)) return types;
    return [...types, { id: current, name: `Saved type ${current}` }];
  };

  return (
    <>
      <section className={styles.card}>
        <h1>Jira</h1>
        <p className="nh-hint">
          Approved projects and their steps go out to Jira as an epic and issues, and progress comes back. Use a
          separate integration account in Jira, not a person: its changes are not copied back.
        </p>
        <p className={styles.jiraHeadline} data-tone={headline.tone} role="status">{headline.text}</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              <tr><th>Site</th><td>{st.siteUrl ?? "-"}{st.projectKey ? <span className={styles.sub}>project {st.projectKey}</span> : null}</td></tr>
              <tr><th>Integration account</th><td>{st.account ? st.account.name : "-"} <span className={styles.sub}>learned from the first good round</span></td></tr>
              <tr><th>Switched on</th><td>{st.on ? (st.enabledAt ? `since ${day(st.enabledAt)}` : "yes") : "no"}{st.on ? <span className={styles.sub}>only ideas decided after this get an epic by themselves</span> : null}</td></tr>
              <tr><th>Last round</th><td>{ago(st.lastRunAt, now)}{st.lastOkAt ? <span className={styles.sub}>last good round {ago(st.lastOkAt, now)}</span> : null}</td></tr>
              <tr><th>Linked</th><td>{st.linked ? `${st.linked.projects} ${st.linked.projects === 1 ? "project" : "projects"}, ${st.linked.steps} ${st.linked.steps === 1 ? "step" : "steps"}` : "-"}</td></tr>
            </tbody>
          </table>
        </div>
        {st.lastError ? (
          <p className={styles.error} role="alert">
            {st.tokenExpired ? "Jira refused the token - it has expired or was revoked. Enter a new one below and save." : st.lastError}
          </p>
        ) : null}
        {st.problems.length ? (
          <>
            <h3>{st.lastError ? "Problems" : "Waiting for the sync"} <span className={styles.sub}>{st.problems.length} {st.problems.length === 1 ? "item" : "items"}</span></h3>
            <ul className={styles.jiraProblems}>
              {st.problems.slice(0, 20).map((p) => <li key={p.projectId + ":" + (p.stepId ?? "")}>{p.message}</li>)}
              {st.problems.length > 20 ? <li className={styles.sub}>and {st.problems.length - 20} more</li> : null}
            </ul>
          </>
        ) : null}
        <div className={styles.jiraActions}>
          {st.on ? (
            <>
              <button type="button" className="nh-btn" disabled={pending} onClick={() => act(() => setJiraOnAction(false))}>Switch off</button>
              <button type="button" className="nh-btn" disabled={pending} onClick={() => act(syncJiraNowAction)}>Sync now</button>
            </>
          ) : (
            <button type="button" className="nh-btn nh-btn-primary" disabled={pending || !st.configured} onClick={() => act(() => setJiraOnAction(true))}>Switch on</button>
          )}
          {!st.configured ? <span className="nh-hint">Save the settings and a token first.</span> : null}
        </div>
      </section>

      <section className={styles.card}>
        <h2>Connection</h2>
        {!view.vault ? <p className={styles.warn}>CONNECTOR_VAULT_KEY is missing - the token cannot be stored until it is set.</p> : null}
        <div className={styles.grid}>
          <Field id="jira-flavor" label="Jira">
            <select className="nh-input" id="jira-flavor" value={form.flavor} onChange={(e) => set("flavor", e.target.value)}>
              <option value="cloud">Cloud (atlassian.net)</option>
              <option value="dc" disabled>Data Center - later</option>
            </select>
          </Field>
          <Field id="jira-site" label="Site address" hint="For example https://acme.atlassian.net">
            <input className="nh-input" id="jira-site" value={form.siteUrl} onChange={(e) => set("siteUrl", e.target.value)} placeholder="https://acme.atlassian.net" autoComplete="off" />
          </Field>
          <Field id="jira-email" label="Integration account email">
            <input className="nh-input" id="jira-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
          </Field>
          <Field
            id="jira-token"
            label="API token"
            hint={st.hasToken
              ? `Saved${view.savedAt ? " on " + day(view.savedAt) : ""}. It is never shown again - type a new one only to replace it. Tokens expire within a year.`
              : "Create it as the integration account: id.atlassian.com → Security → API tokens. It is stored sealed and cannot be read back."}
          >
            <input className="nh-input" id="jira-token" type="password" value={form.token} onChange={(e) => set("token", e.target.value)}
              placeholder={st.hasToken ? "•••••••• (saved)" : ""} autoComplete="new-password" />
          </Field>
          <Field id="jira-key" label="Project key" hint="The Jira project the epics and issues go into, for example NUP.">
            <input className="nh-input" id="jira-key" value={form.projectKey} onChange={(e) => set("projectKey", e.target.value.toUpperCase())} autoComplete="off" />
          </Field>
        </div>
        <div className={styles.jiraActions}>
          <button type="button" className="nh-btn" disabled={pending} onClick={onTest}>{pending ? "Working…" : "Test connection"}</button>
        </div>
        {test ? (
          <div role="status">
            {test.error ? <p className={styles.error} role="alert">{test.error}</p> : null}
            {test.checks.length ? (
              <ul className={styles.jiraChecks}>
                {test.checks.map((c) => (
                  <li key={c.id} data-ok={c.ok}>
                    <span aria-hidden="true">{c.ok ? "✓" : "✗"}</span>
                    <span><strong>{c.label}</strong><span className={styles.sub}>{c.detail}</span></span>
                  </li>
                ))}
              </ul>
            ) : null}
            {test.checks.length ? <p className="nh-hint">{test.ok ? `All checks passed${test.account ? " as " + test.account.name : ""}. Pick the issue types below and save.` : "Fix what failed, then test again."}</p> : null}
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2>What goes where</h2>
        <div className={styles.grid}>
          <div className={styles.two}>
            <Field id="jira-epic" label="Epic type" hint={types.length ? undefined : "Run Test connection to list the types."}>
              <select className="nh-input" id="jira-epic" value={form.epicTypeId} onChange={(e) => set("epicTypeId", e.target.value)}>
                <option value="">Choose…</option>
                {typeOptions(form.epicTypeId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field id="jira-step" label="Step type" hint="What each step becomes under the epic.">
              <select className="nh-input" id="jira-step" value={form.stepTypeId} onChange={(e) => set("stepTypeId", e.target.value)}>
                <option value="">Choose…</option>
                {typeOptions(form.stepTypeId).map((t) => <option key={t.id} value={t.id}>{t.name}{t.subtask ? " (sub-task)" : ""}</option>)}
              </select>
            </Field>
          </div>
          <fieldset className={styles.jiraSwitches}>
            <legend className="nh-label">Switches</legend>
            <label><input type="checkbox" checked={form.autoEpic} onChange={(e) => set("autoEpic", e.target.checked)} /> Create the epic by itself when an idea is decided &ldquo;Yes, do it&rdquo;</label>
            <label><input type="checkbox" checked={form.pullNewIssues} onChange={(e) => set("pullNewIssues", e.target.checked)} /> New issues under the epic in Jira become steps on the board</label>
            <label><input type="checkbox" checked={form.pullComments} onChange={(e) => set("pullComments", e.target.checked)} /> Jira comments become project comments (cut to 2000 characters, no author)</label>
          </fieldset>
          <div>
            <h3>Status for each column</h3>
            <p className="nh-hint">
              By default a move on the board picks the Jira transition by status category. To always land on one
              particular status, enter its id. Blocked has no twin in Jira and shows as In Progress.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Column</th><th>By category</th><th>Or this status id</th></tr></thead>
                <tbody>
                  {STEP_COLUMNS.map((c) => (
                    <tr key={c}>
                      <td>{COLUMN_LABEL[c]}</td>
                      <td>{CATEGORY_LABEL[CATEGORY_FOR[c]]}</td>
                      <td>
                        <input className="nh-input" aria-label={`Jira status id for ${COLUMN_LABEL[c]}`} inputMode="numeric" placeholder="by category"
                          value={form.statusFor[c]} onChange={(e) => set("statusFor", { ...form.statusFor, [c]: e.target.value.trim() })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {note?.error ? <p className={styles.error} role="alert">{note.error}</p> : null}
        {note?.ok ? <p className="nh-hint" role="status">Done.</p> : null}
        <div className={styles.jiraActions}>
          <button type="button" className="nh-btn nh-btn-primary" disabled={pending} onClick={() => act(async () => {
            const r = await saveJiraAction(form);
            if (r.ok) set("token", "");
            return r;
          })}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Webhook <span className={styles.sub}>optional - makes changes in Jira arrive at once</span></h2>
        <p className="nh-hint">
          Without it the app checks Jira every minute. In Jira: Settings → System → Webhooks → Create, paste the
          address and the secret, and tick issue and comment events.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              <tr><th>Address</th><td><code className={styles.jiraCode}>{view.webhookUrl}</code></td></tr>
              <tr><th>Secret</th><td>{st.hasWebhookSecret ? "set - not shown again" : "none"}</td></tr>
            </tbody>
          </table>
        </div>
        {secret ? (
          <div className={styles.ok} role="status">
            <strong>Copy the secret now - it is not shown again.</strong>
            <code className={styles.code}>{secret}</code>
          </div>
        ) : null}
        <div className={styles.jiraActions}>
          <button type="button" className="nh-btn" disabled={pending || !st.configured} onClick={onSecret}>{st.hasWebhookSecret ? "Make a new secret" : "Make a secret"}</button>
          {st.hasWebhookSecret ? <button type="button" className="nh-btn" disabled={pending} onClick={() => { setSecret(null); act(removeWebhookSecretAction); }}>Remove webhook</button> : null}
        </div>
      </section>

      {st.hasToken || st.configured ? (
        <section className={styles.card}>
          <h2>Remove</h2>
          <p className="nh-hint">Forgets the settings, the token and the secret, and stops the sync. Epics and issues already in Jira stay as they are.</p>
          <div className={styles.jiraActions}>
            {confirmRemove ? (
              <>
                <button type="button" className="nh-btn" disabled={pending} onClick={() => { setConfirmRemove(false); setSecret(null); act(removeJiraAction); }}>Yes, remove the Jira integration</button>
                <button type="button" className="nh-btn nh-btn-ghost" onClick={() => setConfirmRemove(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="nh-btn" onClick={() => setConfirmRemove(true)}>Remove the integration…</button>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
