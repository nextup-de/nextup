"use client";
// Settings -> Webhooks: the send switch, the subscriptions with a create/edit drawer, the shown-once secret
// box and the deliveries with Retry. Every change calls an action from server/actions/settings/webhooks.ts.
import { PUBLIC_EVENT_TYPES } from "@nextup/contracts/public";
import { useState, useTransition, type FormEvent } from "react";
import { Banner, ConfirmDialog, DataTable, EditDrawer, SecretOnce, SectionCard } from "@/components/ui/elements";
import type { DeliveryView } from "@/features/api/webhook-form";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import {
  createWebhookAction, deleteWebhookAction, dropOldSecretAction, retryDeliveryAction, rotateSecretAction,
  setWebhooksSendingAction, updateWebhookAction, type WebhookResult,
} from "@/server/actions/settings/webhooks";
import s from "./settings.module.css";
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
const FORM = "webhook-form";

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

  // A new secret shows on the page; one from Rotate shows inside the open drawer, which would cover the page.
  const secretBox = secret ? (
    <>
      <SecretOnce value={secret} note={t("settingsWebhooks.secretHint")} copyLabel={t("settingsWebhooks.copy")} copiedLabel={t("settingsWebhooks.copied")} testId="settings-webhooks-secret-value" />
      <div className={styles.actions}>
        <button className={s.soft} type="button" onClick={() => setSecret(null)}>{t("settingsWebhooks.secretDone")}</button>
      </div>
    </>
  ) : null;

  return (
    <div className={s.page}>
      <div data-testid="settings-webhooks-send">
        <SectionCard name="send" title={t("settingsWebhooks.sendTitle")} hint={t("settingsWebhooks.sendHint")}>
          <label className={s.switch}>
            <input type="checkbox" checked={sending} disabled={pending} data-testid="settings-webhooks-switch"
              onChange={(e) => run(() => setWebhooksSendingAction(slug, e.currentTarget.checked))} />
            {t("settingsWebhooks.sendLabel")}
          </label>
        </SectionCard>
      </div>

      {error && !open ? <div data-testid="settings-webhooks-error"><Banner tone="error">{t(error)}</Banner></div> : null}
      {note ? <div role="status" data-testid="settings-webhooks-note"><Banner tone="info">{t(note)}</Banner></div> : null}

      {secret && !open ? (
        <div data-testid="settings-webhooks-secret">
          <SectionCard name="secret" title={t("settingsWebhooks.secretTitle")}>{secretBox}</SectionCard>
        </div>
      ) : null}

      <div data-testid="settings-webhooks-subs">
        <SectionCard
          name="subs"
          title={t("settingsWebhooks.subsTitle")}
          action={<button className={s.save} type="button" onClick={() => show("new")} data-testid="settings-webhooks-add">{t("settingsWebhooks.add")}</button>}
        >
          {!sending ? <Banner tone="warn">{t("settingsWebhooks.sendOff")}</Banner> : null}
          {subs.length === 0 ? <p className={s.empty}>{t("settingsWebhooks.subsNone")}</p> : (
            <DataTable
              rows={subs}
              rowKey={(w) => w.id}
              empty={t("settingsWebhooks.subsNone")}
              columns={[
                { key: "url", header: t("settingsWebhooks.colAddress"), width: "minmax(0, 2fr)", render: (w) => <span className={s.mono} data-testid={`settings-webhooks-sub-${w.id}`}>{w.url}</span> },
                { key: "events", header: t("settingsWebhooks.colEvents"), width: "80px", render: (w) => w.events.length },
                {
                  key: "state", header: t("settingsWebhooks.colStatus"),
                  render: (w) => (
                    <span className={styles.pills}>
                      <span className={styles.pill} data-status={w.on ? "sent" : "skipped"}>{w.on ? t("settingsWebhooks.on") : t("settingsWebhooks.off")}</span>
                      {w.lastStatus ? <span className={styles.pill} data-status={w.lastStatus}>{t(STATUS_LABEL[w.lastStatus], { time: "" }).trim()}</span> : null}
                    </span>
                  ),
                },
                { key: "edit", header: "", width: "80px", render: (w) => <button className={s.soft} type="button" onClick={() => show(w)} data-testid={`settings-webhooks-edit-${w.id}`}>{t("settingsWebhooks.edit")}</button> },
              ]}
            />
          )}
        </SectionCard>
      </div>

      {open ? (
        <EditDrawer
          key={editing?.id ?? "new"}
          title={editing ? editing.host : t("settingsWebhooks.add")}
          closeLabel={t("settingsWebhooks.cancel")}
          onClose={() => setOpen(null)}
          testId="settings-webhooks-drawer"
          foot={
            <>
              {editing ? <button className={s.ghostDanger} type="button" onClick={() => setConfirm("delete")} data-testid="settings-webhooks-delete">{t("settingsWebhooks.delete")}</button> : null}
              <button className={s.soft} type="button" onClick={() => setOpen(null)}>{t("settingsWebhooks.cancel")}</button>
              <button className={s.save} type="submit" form={FORM} disabled={pending} data-testid="settings-webhooks-save">{t("settingsWebhooks.save")}</button>
            </>
          }
        >
          <form id={FORM} className={styles.form} onSubmit={submit}>
            <label className={s.field}>
              <span className={s.label}>{t("settingsWebhooks.addressLabel")}</span>
              <input className={s.input} name="url" type="url" required maxLength={2000} defaultValue={editing?.url ?? ""} autoComplete="off" data-testid="settings-webhooks-url" />
              <span className={s.help}>{t("settingsWebhooks.addressHint")}</span>
            </label>
            <fieldset className={styles.fieldset}>
              <legend className={s.label}>{t("settingsWebhooks.eventsLabel")}</legend>
              {PUBLIC_EVENT_TYPES.map((e) => (
                <label key={e} className={styles.check}>
                  <input type="checkbox" name="events" value={e} defaultChecked={editing ? editing.events.includes(e) : false} />
                  <span>{t(EVENT_LABEL[e])} <span className={s.mono}>{e}</span></span>
                </label>
              ))}
            </fieldset>
            <label className={s.switch}>
              <input type="checkbox" name="on" defaultChecked={editing ? editing.on : true} />
              {t("settingsWebhooks.onLabel")}
            </label>
            {error ? <p className={s.fieldError} role="alert" data-testid="settings-webhooks-error">{t(error)}</p> : null}
          </form>
          {secret ? (
            <div className={styles.secrets} data-testid="settings-webhooks-secret">
              <h3 className={s.subLabel}>{t("settingsWebhooks.secretTitle")}</h3>
              {secretBox}
            </div>
          ) : null}
          {editing ? (
            <div className={styles.secrets}>
              <p className={s.help}>{t("settingsWebhooks.secrets", { n: editing.secretCount })}</p>
              <div className={styles.actions}>
                <button className={s.soft} type="button" disabled={pending} data-testid="settings-webhooks-rotate"
                  onClick={() => run(() => rotateSecretAction(slug, editing.id), (r) => { setSecret(r.secret ?? null); setOpen({ ...editing, secretCount: editing.secretCount + 1 }); })}>
                  {t("settingsWebhooks.rotate")}
                </button>
                {editing.secretCount > 1 ? <button className={s.soft} type="button" onClick={() => setConfirm("dropOld")} data-testid="settings-webhooks-dropold">{t("settingsWebhooks.dropOld")}</button> : null}
              </div>
            </div>
          ) : null}
        </EditDrawer>
      ) : null}

      {editing && confirm === "delete" ? (
        <ConfirmDialog
          title={t("settingsWebhooks.delete")}
          text={t("settingsWebhooks.deleteConfirm")}
          confirmLabel={t("settingsWebhooks.confirm")}
          cancelLabel={t("settingsWebhooks.cancel")}
          danger
          onConfirm={() => run(() => deleteWebhookAction(slug, editing.id), () => { setConfirm(null); setOpen(null); })}
          onCancel={() => setConfirm(null)}
          testId="settings-webhooks-delete-dialog"
        />
      ) : null}
      {editing && confirm === "dropOld" ? (
        <ConfirmDialog
          title={t("settingsWebhooks.dropOld")}
          text={t("settingsWebhooks.dropOldConfirm")}
          confirmLabel={t("settingsWebhooks.confirm")}
          cancelLabel={t("settingsWebhooks.cancel")}
          danger
          onConfirm={() => run(() => dropOldSecretAction(slug, editing.id), () => { setConfirm(null); setOpen({ ...editing, secretCount: 1 }); })}
          onCancel={() => setConfirm(null)}
          testId="settings-webhooks-dropold-dialog"
        />
      ) : null}

      <div data-testid="settings-webhooks-deliveries">
        <SectionCard name="deliveries" title={t("settingsWebhooks.deliveriesTitle")} hint={t("settingsWebhooks.deliveriesHint")}>
          {deliveries.length === 0 ? <p className={s.empty}>{t("settingsWebhooks.deliveriesNone")}</p> : (
            <DataTable
              rows={deliveries}
              rowKey={(d) => d.id}
              empty={t("settingsWebhooks.deliveriesNone")}
              columns={[
                { key: "time", header: t("settingsWebhooks.colTime"), width: "150px", render: (d) => <time dateTime={d.at} data-testid={`settings-webhooks-delivery-${d.id}`}>{stamp(d.at)}</time> },
                { key: "event", header: t("settingsWebhooks.colEvent"), render: (d) => <span className={s.mono}>{d.event}</span> },
                { key: "host", header: t("settingsWebhooks.colAddress"), render: (d) => d.host },
                { key: "try", header: t("settingsWebhooks.colTry"), width: "60px", render: (d) => d.attempt },
                {
                  key: "status", header: t("settingsWebhooks.colStatus"), width: "minmax(0, 1.2fr)",
                  render: (d) => (
                    <span className={styles.statusCell}>
                      <span className={styles.pill} data-status={d.status}>{t(STATUS_LABEL[d.status], { time: d.nextAt ? hhmm(d.nextAt) : "" })}</span>
                      {d.detail ? <span className={styles.detail}>{d.detail}</span> : null}
                    </span>
                  ),
                },
                {
                  key: "retry", header: "", width: "110px",
                  render: (d) => (d.status === "failed" ? (
                    <button className={s.soft} type="button" disabled={pending} data-testid={`settings-webhooks-retry-${d.id}`}
                      onClick={() => run(() => retryDeliveryAction(slug, d.id), undefined, "settingsWebhooks.queued")}>
                      {t("settingsWebhooks.retry")}
                    </button>
                  ) : null),
                },
              ]}
            />
          )}
        </SectionCard>
      </div>

      <div data-testid="settings-webhooks-signature">
        <SectionCard name="signature" title={t("settingsWebhooks.sigTitle")}>
          <p className={styles.body}>{t("settingsWebhooks.sigBody")}</p>
          <a className={styles.link} href={docsHref}>{t("settingsWebhooks.sigLink")}</a>
        </SectionCard>
      </div>
    </div>
  );
}
