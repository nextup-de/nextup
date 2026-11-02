"use client";
// /admin/knowledge: the idea studio for this company - the publish threshold and how many drafts
// and published ideas exist. Counts only: drafts are private to their author (docs/IDEAS.md).
// Client only for useActionState's saved/error line.
import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { useT } from "@/i18n/client";
import { saveIdeaSettingsAction, type IdeaSettingsState } from "@/server/actions/ideas-admin";
import styles from "@/app/admin/admin.module.css";

export function IdeaStudioAdmin({ threshold, drafts, published }: { threshold: number; drafts: number; published: number }) {
  const t = useT();
  const [state, act, pending] = useActionState<IdeaSettingsState, FormData>(saveIdeaSettingsAction, {});
  const tiles: [string, string][] = [[String(threshold), t("adminPrivacy.ideasTileThreshold")], [String(drafts), t("adminPrivacy.ideasTileDrafts")], [String(published), t("adminPrivacy.ideasTilePublished")]];
  return (
    <section className={styles.card} data-testid="console-data-ideas">
      <h2>{t("adminPrivacy.ideasTitle")}</h2>
      <p className="nh-hint">{t("adminPrivacy.ideasLead")}</p>
      <div className={styles.tiles}>
        {tiles.map(([v, l]) => (
          <div key={l} className={styles.tile}>
            <div className={styles.tileValue}>{v}</div>
            <div className={styles.tileLabel}>{l}</div>
          </div>
        ))}
      </div>
      <form action={act} className={styles.grid}>
        <Field id="publishThreshold" label={t("adminPrivacy.ideasField")} hint={t("adminPrivacy.ideasFieldHint")}>
          <input className="nh-input" id="publishThreshold" name="publishThreshold" type="number" min={0} max={100} defaultValue={threshold} />
        </Field>
        {state.code ? <p className={styles.error} role="alert" data-testid="console-data-ideas-error">{t(state.code === "invalid" ? "adminPrivacy.errInvalidThreshold" : state.code === "support-read-only" ? "adminPrivacy.errSupportReadOnly" : state.code === "no-database" ? "adminPrivacy.errNoDatabase" : "adminPrivacy.errNotAllowed")}</p> : null}
        {state.ok ? <p className="nh-hint" role="status">{t("adminPrivacy.saved")}</p> : null}
        <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="console-data-ideas-save">{pending ? t("adminPrivacy.saving") : t("adminPrivacy.save")}</button>
      </form>
    </section>
  );
}
