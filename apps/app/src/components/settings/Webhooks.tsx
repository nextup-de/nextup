"use client";
// Settings -> Webhooks: the send switch, the subscriptions with a create/edit drawer, the shown-once secret
// box and the deliveries with Retry. Every change calls an action from server/actions/settings/webhooks.ts.
import { PUBLIC_EVENT_TYPES } from "@nextup/contracts/public";
import { useState, useTransition, type FormEvent } from "react";
import type { DeliveryView } from "@/features/api/webhook-form";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import {
  createWebhookAction, deleteWebhookAction, dropOldSecretAction, retryDeliveryAction, rotateSecretAction,
  setWebhooksSendingAction, updateWebhookAction, type WebhookResult,
} from "@/server/actions/settings/webhooks";
import styles from "./Webhooks.module.css";

export type WebhookView = { id: string; url: string; host: string; events: string[]; on: boolean; secretCount: number; lastStatus: DeliveryView["status"] | null };
type Props = { slug: string; sending: boolean; subs: WebhookView[]; deliveries: DeliveryView[]; docsHref: string };

const EVENT_LABEL: Record<string, MessageKey> = {
  "case.raised": "settingsWebhooks.event_case_raised",
  "case.handed": "settingsWebhooks.event_case_handed",
  "case.answered": "settingsWebhooks.event_case_answered",
  "case.decided": "settingsWebhooks.event_case_decided",
  "project.started": "settingsWebhooks.event_project_started",
  "project.done": "settingsWebhooks.event_project_done",
  "project.stopped": "settingsWebhooks.event_project_stopped",
};
const STATUS_LABEL: Record<DeliveryView["status"], MessageKey> = {
  sent: "settingsWebhooks.statusSent", retrying: "settingsWebhooks.statusRetrying", failed: "settingsWebhooks.statusFailed",
  skipped: "settingsWebhooks.statusSkipped", waiting: "settingsWebhooks.statusWaiting",
};
const hhmm = (iso: string) => iso.slice(11, 16);
const stamp = (iso: string) => iso.slice(0, 16).replace("T", " ");

export function Webhooks({ slug, sending, subs, deliveries, docsHref }: Props) {
  const t = useT();
  const [open, setOpen] = useState<WebhookView | "new" | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "dropOld" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [note, setNote] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();

  const run = (call: () => Promise<WebhookResult>, after?: (r: Extract<WebhookResult, { ok: true }>) => void, ok?: MessageKey) =>
    start(async () => {
      const r = await call();
      setError(r.ok ? null : r.error);
      setNote(r.ok ? (ok ?? null) : null);
      if (r.ok) after?.(r);
    });

  const show = (w: WebhookView | "new") => { setError(null); setNote(null); setConfirm(null); setSecret(null); setOpen(w); };
  const editing = open && open !== "new" ? open : null;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = { url: String(f.get("url") ?? ""), events: f.getAll("events").map(String), on: f.get("on") === "on" };
    if (editing) run(() => updateWebhookAction(slug, { id: editing.id, ...input }), () => setOpen(null), "settingsWebhooks.saved");
    else run(() => createWebhookAction(slug, input), (r) => { setSecret(r.secret ?? null); setOpen(null); }, "settingsWebhooks.saved");
  };

  return (
    <div className={styles.wrap}>
      <section className={styles.card} data-testid="settings-webhooks-send">
        <h2 className={styles.title}>{t("settingsWebhooks.sendTitle")}</h2>
        <label className={styles.inline}>
          <input type="checkbox" checked={sending} disabled={pending} data-testid="settings-webhooks-switch"
            onChange={(e) => run(() => setWebhooksSendingAction(slug, e.currentTarget.checked))} />
          {t("settingsWebhooks.sendLabel")}
        </label>
        <p className="nh-hint">{t("settingsWebhooks.sendHint")}</p>
      </section>

      {error ? <p className="nh-error" role="alert" data-testid="settings-webhooks-error">{t(error)}</p> : null}
      {note ? <p className="nh-hint" role="status" data-testid="settings-webhooks-note">{t(note)}</p> : null}

      {secret ? (
        <section className={styles.card} data-testid="settings-webhooks-secret">
          <h2 className={styles.title}>{t("settingsWebhooks.secretTitle")}</h2>
          <code className={styles.mono} data-testid="settings-webhooks-secret-value">{secret}</code>
          <p className="nh-hint">{t("settingsWebhooks.secretHint")}</p>
          <button className="nh-btn" type="button" onClick={() => setSecret(null)}>{t("settingsWebhooks.secretDone")}</button>
        </section>
      ) : null}

      <section className={styles.card} data-testid="settings-webhooks-subs">
        <div className={styles.head}>
          <h2 className={styles.title}>{t("settingsWebhooks.subsTitle")}</h2>
          <button className="nh-btn nh-btn-primary" type="button" onClick={() => show("new")} data-testid="settings-webhooks-add">{t("settingsWebhooks.add")}</button>
        </div>
        {!sending ? <p className={styles.warn}>{t("settingsWebhooks.sendOff")}</p> : null}
        {subs.length === 0 ? <p>{t("settingsWebhooks.subsNone")}</p> : (
          <ul className={styles.list}>
            {subs.map((s) => (
              <li key={s.id} className={styles.row} data-testid={`settings-webhooks-sub-${s.id}`}>
                <span className={styles.mono}>{s.url}</span>
                <span className="nh-hint">
                  {s.events.length} · {s.on ? t("settingsWebhooks.on") : t("settingsWebhooks.off")}
                  {s.lastStatus ? ` · ${t(STATUS_LABEL[s.lastStatus], { time: "" }).trim()}` : ""}
                </span>
                <button className="nh-btn" type="button" onClick={() => show(s)} data-testid={`settings-webhooks-edit-${s.id}`}>{t("settingsWebhooks.edit")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open ? (
        <form className={styles.drawer} onSubmit={submit} key={editing?.id ?? "new"} data-testid="settings-webhooks-drawer">
          <h2 className={styles.title}>{editing ? editing.host : t("settingsWebhooks.add")}</h2>
          <label>
            {t("settingsWebhooks.addressLabel")}
            <input name="url" type="url" required maxLength={2000} defaultValue={editing?.url ?? ""} data-testid="settings-webhooks-url" />
          </label>
          <p className="nh-hint">{t("settingsWebhooks.addressHint")}</p>
          <fieldset className={styles.events}>
            <legend>{t("settingsWebhooks.eventsLabel")}</legend>
            {PUBLIC_EVENT_TYPES.map((e) => (
              <label key={e} className={styles.inline}>
                <input type="checkbox" name="events" value={e} defaultChecked={editing ? editing.events.includes(e) : false} />
                {t(EVENT_LABEL[e])} <span className={styles.mono}>{e}</span>
              </label>
            ))}
          </fieldset>
          <label className={styles.inline}>
            <input type="checkbox" name="on" defaultChecked={editing ? editing.on : true} />
            {t("settingsWebhooks.onLabel")}
          </label>
          {editing ? (
            <div className={styles.buttons}>
              <p className="nh-hint">{t("settingsWebhooks.secrets", { n: editing.secretCount })}</p>
              <button className="nh-btn" type="button" disabled={pending} data-testid="settings-webhooks-rotate"
                onClick={() => run(() => rotateSecretAction(slug, editing.id), (r) => { setSecret(r.secret ?? null); setOpen({ ...editing, secretCount: editing.secretCount + 1 }); })}>
                {t("settingsWebhooks.rotate")}
              </button>
              {editing.secretCount > 1 ? (
                confirm === "dropOld" ? (
                  <>
                    <span>{t("settingsWebhooks.dropOldConfirm")}</span>
                    <button className="nh-btn" type="button" disabled={pending} data-testid="settings-webhooks-dropold-yes"
                      onClick={() => run(() => dropOldSecretAction(slug, editing.id), () => { setConfirm(null); setOpen({ ...editing, secretCount: 1 }); })}>
                      {t("settingsWebhooks.confirm")}
                    </button>
                  </>
                ) : (
                  <button className="nh-btn" type="button" onClick={() => setConfirm("dropOld")} data-testid="settings-webhooks-dropold">{t("settingsWebhooks.dropOld")}</button>
                )
              ) : null}
            </div>
          ) : null}
          <div className={styles.buttons}>
            <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-webhooks-save">{t("settingsWebhooks.save")}</button>
            <button className="nh-btn" type="button" onClick={() => setOpen(null)}>{t("settingsWebhooks.cancel")}</button>
            {editing ? (
              confirm === "delete" ? (
                <>
                  <span>{t("settingsWebhooks.deleteConfirm")}</span>
                  <button className="nh-btn" type="button" disabled={pending} data-testid="settings-webhooks-delete-yes"
                    onClick={() => run(() => deleteWebhookAction(slug, editing.id), () => { setConfirm(null); setOpen(null); })}>
                    {t("settingsWebhooks.confirm")}
                  </button>
                </>
              ) : (
                <button className="nh-btn" type="button" onClick={() => setConfirm("delete")} data-testid="settings-webhooks-delete">{t("settingsWebhooks.delete")}</button>
              )
            ) : null}
          </div>
        </form>
      ) : null}

      <section className={styles.card} data-testid="settings-webhooks-deliveries">
        <h2 className={styles.title}>{t("settingsWebhooks.deliveriesTitle")}</h2>
        <p className="nh-hint">{t("settingsWebhooks.deliveriesHint")}</p>
        {deliveries.length === 0 ? <p>{t("settingsWebhooks.deliveriesNone")}</p> : (
          <div className={styles.scroll}>
            <table>
              <thead>
                <tr>
                  <th>{t("settingsWebhooks.colTime")}</th><th>{t("settingsWebhooks.colEvent")}</th><th>{t("settingsWebhooks.colAddress")}</th>
                  <th>{t("settingsWebhooks.colTry")}</th><th>{t("settingsWebhooks.colStatus")}</th><th />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} data-testid={`settings-webhooks-delivery-${d.id}`}>
                    <td><time dateTime={d.at}>{stamp(d.at)}</time></td>
                    <td className={styles.mono}>{d.event}</td>
                    <td>{d.host}</td>
                    <td>{d.attempt}</td>
                    <td>
                      <span className={`${styles.pill} ${styles[d.status]}`}>
                        {t(STATUS_LABEL[d.status], { time: d.nextAt ? hhmm(d.nextAt) : "" })}
                      </span>
                      {d.detail ? <div className="nh-hint">{d.detail}</div> : null}
                    </td>
                    <td>
                      {d.status === "failed" ? (
                        <button className="nh-btn" type="button" disabled={pending} data-testid={`settings-webhooks-retry-${d.id}`}
                          onClick={() => run(() => retryDeliveryAction(slug, d.id), undefined, "settingsWebhooks.queued")}>
                          {t("settingsWebhooks.retry")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card} data-testid="settings-webhooks-signature">
        <h2 className={styles.title}>{t("settingsWebhooks.sigTitle")}</h2>
        <p>{t("settingsWebhooks.sigBody")}</p>
        <a href={docsHref}>{t("settingsWebhooks.sigLink")}</a>
      </section>
    </div>
  );
}
