"use client";
// One pilot request, everything that can be done with it: read it, correct it, keep notes, answer
// it (sent from here, or written in a mail app and logged), mark it replied, delete it.
//
// The forms submit through startTransition instead of <form action>, on purpose: React resets a
// form after its action runs, and a mail server saying no must not cost the admin a written reply.
import { useActionState, useState, useTransition } from "react";
import {
  deletePilotRequestAction,
  markPilotRequestHandled,
  replyPilotRequestAction,
  updatePilotRequestAction,
  type DeleteRequestState,
  type EditRequestState,
  type HandledState,
  type ReplyState,
} from "@/server/actions/admin";
import type { PilotRequestRow } from "@/features/admin/rows";
import { isOverdue, mailtoHref, replyDraft, replySubject, workingDaysBetween } from "@/features/admin/requests";
import { COUNCIL } from "@/features/pilot/request";
import { Field } from "@/components/ui/Field";
import styles from "@/app/admin/admin.module.css";

const COUNCIL_LABEL: Record<string, string> = { yes: "Yes", no: "No", "not sure": "Not sure" };

// A fixed zone, not the browser's: this renders on the server first, and a different zone on the
// client would be a hydration mismatch (same reason as AutomationTaskView).
function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich",
  });
}

/** Submit a form through a useActionState dispatcher without React's post-action form reset. */
function useSubmit(dispatch: (fd: FormData) => void) {
  const [pending, start] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    start(() => dispatch(fd));
  };
  return { pending, onSubmit };
}

export function RequestPanel({
  request: r,
  readOnly,
  canSend,
  mailTarget,
  companiesHref,
  closeHref,
}: {
  request: PilotRequestRow;
  readOnly: boolean;
  /** SMTP_URL is set and answering - "Send" is offered. Otherwise mail app + "log as sent". */
  canSend: boolean;
  mailTarget: string | null;
  /** Where "Create company" goes, pre-filled from this request. */
  companiesHref: string;
  closeHref: string;
}) {
  const [editing, setEditing] = useState(false);
  const [edit, dispatchEdit] = useActionState<EditRequestState, FormData>(updatePilotRequestAction, {});
  const [reply, dispatchReply] = useActionState<ReplyState, FormData>(replyPilotRequestAction, {});
  const [handled, dispatchHandled] = useActionState<HandledState, FormData>(markPilotRequestHandled, {});
  const [removed, dispatchDelete] = useActionState<DeleteRequestState, FormData>(deletePilotRequestAction, {});
  const editSubmit = useSubmit(dispatchEdit);
  const replySubmit = useSubmit(dispatchReply);
  const [handledPending, startHandled] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const [subject, setSubject] = useState(() => replySubject(r));
  const [body, setBody] = useState(() => replyDraft(r));
  const [composing, setComposing] = useState(!r.handledAt && r.replies.length === 0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // A saved edit closes the form; a sent reply clears the composer for the next one. Done while
  // rendering, on the change of the stamp the action returns - not in an effect.
  const [seenSaved, setSeenSaved] = useState(edit.saved);
  if (edit.saved !== seenSaved) {
    setSeenSaved(edit.saved);
    setEditing(false);
  }
  const [seenSent, setSeenSent] = useState(reply.sent);
  if (reply.sent !== seenSent) {
    setSeenSent(reply.sent);
    setComposing(false);
    setSubject(replySubject(r));
    setBody(replyDraft(r));
  }

  const waited = workingDaysBetween(new Date(r.createdAt), r.handledAt ? new Date(r.handledAt) : new Date());

  function toggleHandled() {
    const fd = new FormData();
    fd.set("id", r.id);
    fd.set("handled", r.handledAt ? "0" : "1");
    startHandled(() => dispatchHandled(fd));
  }

  function remove() {
    const fd = new FormData();
    fd.set("id", r.id);
    fd.set("confirm", "yes");
    startDelete(() => dispatchDelete(fd));
  }

  return (
    <article className={styles.panel} aria-labelledby="req-title">
      <header className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <a href={closeHref} className={styles.back}>← All requests</a>
          <h2 id="req-title">{r.company}</h2>
          <p className={styles.rowMeta}>
            {r.name} · <a href={`mailto:${r.email}`}>{r.email}</a>
          </p>
        </div>
        {readOnly ? null : (
          <div className={styles.panelActions}>
            <button
              type="button"
              className="nh-btn nh-btn-ghost nh-btn-sm"
              onClick={toggleHandled}
              disabled={handledPending}
            >
              {r.handledAt ? "Reopen" : "Mark replied"}
            </button>
            <a className="nh-btn nh-btn-ghost nh-btn-sm" href={companiesHref}>Create company</a>
          </div>
        )}
      </header>
      {handled.error ? <p className={styles.error} role="alert">{handled.error}</p> : null}

      <dl className={styles.facts}>
        <dt>Status</dt>
        <dd>
          {r.handledAt
            ? `Replied ${stamp(r.handledAt)} - after ${waited} working ${waited === 1 ? "day" : "days"}`
            : `Open for ${waited} working ${waited === 1 ? "day" : "days"}${isOverdue(r) ? " - past the two-day promise" : ""}`}
        </dd>
        <dt>Received</dt>
        <dd>{stamp(r.createdAt)}</dd>
        <dt>Works council</dt>
        <dd>{COUNCIL_LABEL[r.council] ?? r.council}</dd>
        <dt>Reference</dt>
        <dd><code>{r.id}</code></dd>
      </dl>

      {/* ── The request itself, or the form that corrects it ─────────────────────────────── */}
      <section className={styles.panelSection}>
        <div className={styles.cardHead}>
          <h3>Request</h3>
          {readOnly || editing ? null : (
            <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>

        {editing ? (
          <form className={styles.grid} onSubmit={editSubmit.onSubmit} noValidate>
            <input type="hidden" name="id" value={r.id} />
            <div className={styles.two}>
              <Field id="e-name" label="Name">
                <input className="nh-input" id="e-name" name="name" defaultValue={r.name} />
              </Field>
              <Field id="e-company" label="Company">
                <input className="nh-input" id="e-company" name="company" defaultValue={r.company} />
              </Field>
            </div>
            <div className={styles.two}>
              <Field id="e-email" label="E-mail">
                <input className="nh-input" id="e-email" name="email" type="email" defaultValue={r.email} />
              </Field>
              <Field id="e-council" label="Works council">
                <select className="nh-input nh-select" id="e-council" name="council" defaultValue={r.council}>
                  {COUNCIL.map((c) => <option key={c} value={c}>{COUNCIL_LABEL[c]}</option>)}
                </select>
              </Field>
            </div>
            <Field id="e-decision" label="The decision that keeps waiting">
              <input className="nh-input" id="e-decision" name="decision" defaultValue={r.decision} />
            </Field>
            <Field id="e-message" label="Message">
              <textarea className="nh-input nh-textarea" id="e-message" name="message" rows={4} defaultValue={r.message} />
            </Field>
            <Field id="e-notes" label="Internal notes" hint="Only visible here. Calls, next steps, who is on it.">
              <textarea className="nh-input nh-textarea" id="e-notes" name="notes" rows={3} defaultValue={r.notes} />
            </Field>
            {edit.problems?.map((p) => <p key={p} className={styles.error} role="alert">{p}</p>)}
            <div className={styles.rowActions}>
              <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={editSubmit.pending}>
                {editSubmit.pending ? "Saving…" : "Save changes"}
              </button>
              <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className={styles.grid}>
            <p className={styles.decisionBig}>{r.decision}</p>
            {r.message ? <p className={styles.quote}>{r.message}</p> : <p className="nh-hint">No message beyond the decision.</p>}
            {r.notes ? (
              <div className={styles.notes}>
                <span className={styles.countLabel}>Internal notes</span>
                <p>{r.notes}</p>
              </div>
            ) : null}
            {edit.saved ? <p className={styles.sent} role="status">Saved.</p> : null}
          </div>
        )}
      </section>

      {/* ── Thread and reply ──────────────────────────────────────────────────────────────── */}
      <section className={styles.panelSection}>
        <div className={styles.cardHead}>
          <h3>Replies {r.replies.length ? <span className={styles.rowMeta}>({r.replies.length})</span> : null}</h3>
          {readOnly || composing ? null : (
            <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => setComposing(true)}>
              {r.replies.length ? "Write another reply" : "Reply"}
            </button>
          )}
        </div>

        {r.replies.length === 0 && !composing ? (
          <p className="nh-hint">
            {r.handledAt ? "Marked replied, but the reply was written outside /admin." : "Nothing sent yet."}
          </p>
        ) : null}

        {r.replies.length ? (
          <ol className={styles.thread}>
            {r.replies.map((x) => (
              <li key={x.id} className={styles.message}>
                <div className={styles.rowMeta}>
                  {stamp(x.sentAt)} · to {x.to} · {x.via === "smtp" ? "sent from admin" : "sent from a mail app"}
                </div>
                <strong>{x.subject}</strong>
                <p className={styles.messageBody}>{x.body}</p>
              </li>
            ))}
          </ol>
        ) : null}

        {reply.sent ? (
          <p className={styles.sent} role="status">
            {reply.via === "smtp" ? `Sent to ${r.email}.` : "Logged."} The request is marked replied.
          </p>
        ) : null}

        {composing && !readOnly ? (
          <form className={styles.grid} onSubmit={replySubmit.onSubmit} noValidate>
            <input type="hidden" name="id" value={r.id} />
            <Field id="r-subject" label={`To ${r.email}`}>
              <input className="nh-input" id="r-subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
            </Field>
            <textarea
              className="nh-input nh-textarea"
              name="body"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label="Reply"
            />
            {reply.problems?.map((p) => <p key={p} className={styles.error} role="alert">{p}</p>)}
            <div className={styles.rowActions}>
              {canSend ? (
                <button type="submit" name="intent" value="send" className="nh-btn nh-btn-primary nh-btn-sm" disabled={replySubmit.pending}>
                  {replySubmit.pending ? "Sending…" : "Send reply"}
                </button>
              ) : null}
              <a className="nh-btn nh-btn-ghost nh-btn-sm" href={mailtoHref(r.email, { subject, body })}>
                Open in mail app
              </a>
              <button type="submit" name="intent" value="log" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={replySubmit.pending}>
                Log as sent
              </button>
              <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setComposing(false)}>Cancel</button>
            </div>
            <p className="nh-hint">
              {canSend
                ? `Send goes out through ${mailTarget}. Wrote it in your own mail app instead? Log it, so the thread stays complete.`
                : "The app cannot send mail (SMTP_URL is not set or not answering - see Connections). Open it in your mail app, send it there, then log it here."}
            </p>
          </form>
        ) : null}
      </section>

      {/* ── Delete ────────────────────────────────────────────────────────────────────────── */}
      {readOnly ? null : (
        <section className={`${styles.panelSection} ${styles.dangerZone}`}>
          {confirmDelete ? (
            <div className={styles.grid}>
              <p>
                Delete the request from {r.company}
                {r.replies.length ? ` and its ${r.replies.length} ${r.replies.length === 1 ? "reply" : "replies"}` : ""} for good?
                There is no undo.
              </p>
              <div className={styles.rowActions}>
                <button type="button" className={`nh-btn nh-btn-sm ${styles.dangerBtn}`} onClick={remove} disabled={deletePending}>
                  {deletePending ? "Deleting…" : "Delete for good"}
                </button>
                <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            </div>
          ) : (
            <div className={styles.cardHead}>
              <span className="nh-hint">Spam, a test, or a duplicate?</span>
              <button type="button" className={`nh-btn nh-btn-ghost nh-btn-sm ${styles.danger}`} onClick={() => setConfirmDelete(true)}>
                Delete request
              </button>
            </div>
          )}
          {removed.error ? <p className={styles.error} role="alert">{removed.error}</p> : null}
        </section>
      )}
    </article>
  );
}
