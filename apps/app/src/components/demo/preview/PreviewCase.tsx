"use client";
// /demo/preview/case: the idea on the desk holder's desk. "Plan it with the agent" shows the draft of
// a plan before the decision; "Yes, do it" proposes a template (the agent's, or the route's default)
// and opens the project in setup.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DeptChip, PageHeader, PersonFace, SectionCard } from "@/components/ui/elements";
import base from "@/components/shell/InputSheet.module.css";
import { PREVIEW_CASE, PREVIEW_DRAFT, ROUTE_TEMPLATE } from "@/features/demo/preview/story";
import { PREVIEW_TEMPLATES, templateOf, type TemplateKey } from "@/features/demo/preview/templates";
import { useT } from "@/i18n/client";
import { usePreview } from "./PreviewProvider";
import styles from "./Preview.module.css";

export function PreviewCase() {
  const { s, send } = usePreview();
  const { href } = useDemo();
  const t = useT();
  const [sheet, setSheet] = useState(false);
  const c = PREVIEW_CASE;
  const decide = s.decided
    ? <Link href={href("/preview/project")} className="nh-btn nh-btn-primary nh-btn-sm">{t("preview.openProject")}</Link>
    : <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => setSheet(true)}>{t("preview.yesButton")}</button>;

  return (
    <>
      <PageHeader title={c.title} lede={t("preview.caseState", { route: c.route })} action={decide} />
      <div className={styles.layout}>
        <div className={styles.stack}>
          <SectionCard>
            <div className={styles.metaRow}>
              <PersonFace name={c.from} size="sm" />
              <span>{t("preview.caseFrom", { name: c.from })}</span>
              <DeptChip name={c.fromDept} />
            </div>
            <p className={styles.text}>{c.body}</p>
            {s.decided && <p className={styles.meta}>{t("preview.decidedNote")}</p>}
          </SectionCard>
          {s.planned ? <Draft /> : (
            <SectionCard title={t("preview.planTitle")} hint={t("preview.planHint")}>
              <div className={styles.row}>
                <button type="button" className="nh-btn nh-btn-secondary nh-btn-sm" disabled={!!s.decided} onClick={() => send({ type: "plan" })}>{t("preview.planButton")}</button>
              </div>
            </SectionCard>
          )}
        </div>
        <SectionCard>
          <p className={styles.meta}>{t("preview.caseOwner", { name: c.owner, role: c.ownerRole })}</p>
          {!s.decided && <p className={`${styles.meta} ${styles.clock}`}>{t("preview.caseClock", { days: c.dueInDays })}</p>}
        </SectionCard>
      </div>
      {sheet && <YesSheet onClose={() => setSheet(false)} />}
    </>
  );
}

function Draft() {
  const t = useT();
  const d = PREVIEW_DRAFT;
  const template = templateOf(d.templateKey);
  return (
    <SectionCard title={t("preview.planTitle")} action={<span className={styles.badge} data-tone="ai">{t("preview.aiDraft")}</span>}>
      <dl className={styles.facts}>
        <dt>{t("preview.draftTemplate")}</dt>
        <dd><span className={styles.strong}>{template.name}</span><br />{d.why}</dd>
        <dt>{t("preview.draftSteps")}</dt>
        <dd>
          <ul className={styles.list}>
            {template.steps.map((x) => <li key={x.title}><span>{x.title}</span><span className={styles.note}>{t("preview.stepLine", { role: x.role, day: x.dueDay })}</span></li>)}
          </ul>
        </dd>
        <dt>{t("preview.draftTeam")}</dt>
        <dd>{d.team.join(" · ")}</dd>
        <dt>{t("preview.draftGoal")}</dt>
        <dd>{d.goal}</dd>
        <dt>{t("preview.draftMetric")}</dt>
        <dd>{d.metric}</dd>
        <dt>{t("preview.draftEffort")}</dt>
        <dd>{d.effort}</dd>
        <dt>{t("preview.draftRisks")}</dt>
        <dd><ul className={styles.list}>{d.risks.map((r) => <li key={r}>{r}</li>)}</ul></dd>
        <dt>{t("preview.draftApprovals")}</dt>
        <dd>{d.approvals}</dd>
      </dl>
    </SectionCard>
  );
}

// The yes, in the app's own sheet (components/shell/LoopSheets.tsx): who leads, which template, and
// whether the agent's draft goes into the setup.
function YesSheet({ onClose }: { onClose: () => void }) {
  const { s, send } = usePreview();
  const { href } = useDemo();
  const t = useT();
  const router = useRouter();
  const proposed = s.planned ? PREVIEW_DRAFT.templateKey : ROUTE_TEMPLATE;
  const [key, setKey] = useState<TemplateKey | null>(proposed);
  const [withDraft, setWithDraft] = useState(s.planned);
  const confirm = () => {
    send({ type: "decide", templateKey: key, withDraft });
    router.push(href("/preview/project"));
  };
  return (
    <>
      <div className={base.backdrop} onClick={onClose} />
      <div className={base.sheet} role="dialog" aria-modal="true" aria-label={t("preview.sheetTitle")}>
        <div className={base.eyebrow}>{t("preview.sheetTitle")}</div>
        <div className={base.title}>{PREVIEW_CASE.title}</div>
        <div className={base.sub}>{t("preview.sheetLead", { name: PREVIEW_CASE.owner })}</div>
        <fieldset className={`${styles.rows} ${styles.choices}`}>
          <legend className={base.textLabel}>{t("preview.sheetTemplate")}</legend>
          {PREVIEW_TEMPLATES.map((tpl) => (
            <label key={tpl.key} className={styles.option} data-on={key === tpl.key ? "true" : undefined}>
              <input type="radio" name="template" checked={key === tpl.key} onChange={() => setKey(tpl.key)} />
              <span className={styles.body}>
                <span className={styles.row}>
                  <span className={styles.strong}>{tpl.name}</span>
                  {tpl.key === proposed && <span className={styles.badge} data-tone={s.planned ? "ai" : "brand"}>{t("preview.sheetProposed")}</span>}
                </span>
                <span className={styles.meta}>{tpl.forWhat} {t("preview.sheetSteps", { count: tpl.steps.length })}.</span>
                {tpl.key === proposed && <span className={styles.meta}>{s.planned ? PREVIEW_DRAFT.why : t("preview.sheetRouteWhy", { route: PREVIEW_CASE.route })}</span>}
              </span>
            </label>
          ))}
          <label className={styles.option} data-on={key === null ? "true" : undefined}>
            <input type="radio" name="template" checked={key === null} onChange={() => setKey(null)} />
            <span className={styles.body}><span className={styles.strong}>{t("preview.sheetNone")}</span><span className={styles.meta}>{t("preview.sheetNoneHint")}</span></span>
          </label>
        </fieldset>
        {s.planned && (
          <label className={`nh-check ${styles.sheetCheck}`}>
            <input type="checkbox" checked={withDraft} onChange={(e) => setWithDraft(e.target.checked)} />
            <span>{t("preview.sheetDraft")}</span>
          </label>
        )}
        <div className={base.actions}>
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={confirm}>{t("preview.sheetConfirm")}</button>
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={onClose}>{t("common.cancel")}</button>
        </div>
      </div>
    </>
  );
}
