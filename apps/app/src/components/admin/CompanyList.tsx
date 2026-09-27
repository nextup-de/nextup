"use client";
// Existing companies: where each one lives, how much is in it, who can get in, and the
// destructive actions.
import { useActionState } from "react";
import {
  createApiTokenAction,
  deleteCompanyAction,
  setCompanyStageAction,
  type CompanyRow,
  type RotateState,
  type StageState,
  type TokenState,
} from "@/server/actions/admin";
import { CompanyAccess } from "./CompanyAccess";
import { nextStage, STAGE_MEANING, type Stage } from "@/features/admin/stages";
import styles from "@/app/admin/admin.module.css";

// readOnly: no database, so the three write actions would only answer with an error. The rows
// still show - see features/admin/demo.ts.
export function CompanyList({ companies, readOnly = false }: { companies: CompanyRow[]; readOnly?: boolean }) {
  const [removed, remove] = useActionState<RotateState, FormData>(deleteCompanyAction, {});
  const [issued, issueToken] = useActionState<TokenState, FormData>(createApiTokenAction, {});
  const [staged, moveStage] = useActionState<StageState, FormData>(setCompanyStageAction, {});

  if (companies.length === 0) return null;

  return (
    <div className={styles.rows}>
      {issued.token ? (
        <div className={styles.ok}>
          <strong>API token for {issued.slug}</strong>
          <div className={styles.code}>{issued.token}</div>
          <p className="nh-hint">
            Paste it into n8n as the credential <code>{issued.slug}-nextup</code>. Shown once -
            only its hash is stored.
          </p>
        </div>
      ) : null}
      {issued.error ? <p className={styles.error} role="alert">{issued.error}</p> : null}
      {staged.error ? <p className={styles.error} role="alert">{staged.error}</p> : null}
      {removed.error ? <p className={styles.error} role="alert">{removed.error}</p> : null}

      {companies.map((c) => (
        <div key={c.id} className={styles.row}>
          <div className={styles.rowMain}>
            <span className={styles.rowName}>{c.name}</span>
            <span className={styles.rowMeta}>
              <a href={c.url}>{c.url}</a> · {c.people} {c.people === 1 ? "person" : "people"} ·{" "}
              {c.events} {c.events === 1 ? "event" : "events"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {readOnly || !nextStage(c.stage) ? (
              <span className={styles.stage} title={STAGE_MEANING[c.stage as Stage]}>{c.stage}</span>
            ) : (
              <form action={moveStage}>
                <input type="hidden" name="slug" value={c.slug} />
                <input type="hidden" name="stage" value={nextStage(c.stage) ?? ""} />
                <button
                  type="submit"
                  className={styles.stageButton}
                  title={`Move to ${nextStage(c.stage)} - ${STAGE_MEANING[nextStage(c.stage) as Stage]}`}
                >
                  {c.stage} <span aria-hidden="true">→</span> {nextStage(c.stage)}
                </button>
              </form>
            )}
            {readOnly ? null : (
              <>
              <form action={issueToken}>
                <input type="hidden" name="slug" value={c.slug} />
                <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit">API token</button>
              </form>
              <form
                action={remove}
                onSubmit={(e) => {
                  const typed = window.prompt(`Delete ${c.slug}? This takes its people and its whole history with it. Type the slug to confirm.`);
                  if (typed === null) { e.preventDefault(); return; }
                  (e.currentTarget.elements.namedItem("confirm") as HTMLInputElement).value = typed;
                }}
              >
                <input type="hidden" name="slug" value={c.slug} />
                <input type="hidden" name="confirm" defaultValue="" />
                <button className={`nh-btn nh-btn-ghost nh-btn-sm ${styles.danger}`} type="submit">Delete</button>
              </form>
              </>
            )}
          </div>
          {readOnly ? null : <CompanyAccess company={c} />}
        </div>
      ))}
    </div>
  );
}
