// /demo/preview/templates: the three templates a yes can start from, each with what a project of that
// kind contains. Read-only: a company's own copies and the editor come later.
import { PageHeader, SectionCard } from "@/components/ui/elements";
import { PREVIEW_CASE, ROUTE_TEMPLATE } from "@/features/demo/preview/story";
import { PREVIEW_TEMPLATES } from "@/features/demo/preview/templates";
import { getT } from "@/i18n/server";
import styles from "./Preview.module.css";

export async function PreviewTemplates() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("preview.templatesTitle")} lede={t("preview.templatesLede")} />
      <div className={styles.templates}>
        {PREVIEW_TEMPLATES.map((tpl) => (
          <SectionCard key={tpl.key} title={tpl.name} hint={tpl.forWhat} name={tpl.key}>
            {tpl.key === ROUTE_TEMPLATE && <div className={styles.row}><span className={styles.badge} data-tone="brand">{t("preview.routeDefault", { route: PREVIEW_CASE.route })}</span></div>}
            <ul className={styles.list}>
              {tpl.steps.map((x) => <li key={x.title}><span>{x.title}</span><span className={styles.note}>{t("preview.stepLine", { role: x.role, day: x.dueDay })}</span></li>)}
            </ul>
            <dl className={styles.facts}>
              <dt>{t("preview.tplRoles")}</dt>
              <dd>{tpl.roles.join(" · ")}</dd>
              <dt>{t("preview.tplMetric")}</dt>
              <dd>{tpl.metric.name} ({tpl.metric.unit}, {t(("preview.better_" + tpl.metric.better) as "preview.better_up")})</dd>
              <dt>{t("preview.tplMeasure")}</dt>
              <dd>{t("preview.tplMeasureDays", { days: tpl.measureDays.join(", ") })}</dd>
              <dt>{t("preview.tplApprovals")}</dt>
              <dd>{tpl.approvals}</dd>
              <dt>{t("preview.tplRhythm")}</dt>
              <dd>{tpl.rhythm}</dd>
            </dl>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
