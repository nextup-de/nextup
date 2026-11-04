"use client";
// /admin/knowledge: the idea studio for this company - the publish threshold and how many drafts
// and published ideas exist. Counts only: drafts are private to their author (docs/IDEAS.md).
// Client only for useActionState's saved/error line.
import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { SectionCard } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import { saveIdeaSettingsAction, type IdeaSettingsState } from "@/server/actions/ideas-admin";
import c from "@/app/admin/people/console.module.css";

export function IdeaStudioAdmin({ threshold, drafts, published }: { threshold: number; drafts: number; published: number }) {
  const t = useT();
  const [state, act, pending] = useActionState<IdeaSettingsState, FormData>(saveIdeaSettingsAction, {});
  const tiles: [string, string][] = [[String(threshold), t("adminPrivacy.ideasTileThreshold")], [String(drafts), t("adminPrivacy.ideasTileDrafts")], [String(published), t("adminPrivacy.ideasTilePublished")]];
  return (
    <SectionCard title={t("adminPrivacy.ideasTitle")} hint={t("adminPrivacy.ideasLead")} name="ideas">
      <div className={c.stack} data-testid="console-data-ideas">
        <div className={c.tiles}>
          {tiles.map(([v, l]) => (
            <div key={l} className={c.tile}>
              <div className={c.tileValue}>{v}</div>
              <div className={c.tileLabel}>{l}</div>
            </div>
          ))}
        </div>
        <form action={act} className={c.form}>
          <Field id="publishThreshold" label={t("adminPrivacy.ideasField")} hint={t("adminPrivacy.ideasFieldHint")}>
            <input className="nh-input" id="publishThreshold" name="publishThreshold" type="number" min={0} max={100} defaultValue={threshold} />
          </Field>
          {state.code ? <p className={c.note} data-tone="error" role="alert" data-testid="console-data-ideas-error">{t(state.code === "invalid" ? "adminPrivacy.errInvalidThreshold" : state.code === "support-read-only" ? "adminPrivacy.errSupportReadOnly" : state.code === "no-database" ? "adminPrivacy.errNoDatabase" : "adminPrivacy.errNotAllowed")}</p> : null}
          {state.ok ? <p className={c.note} role="status">{t("adminPrivacy.saved")}</p> : null}
          <div className={c.foot}>
            <button className={c.primary} type="submit" disabled={pending} data-testid="console-data-ideas-save">{pending ? t("adminPrivacy.saving") : t("adminPrivacy.save")}</button>
          </div>
        </form>
      </div>
    </SectionCard>
  );
}
