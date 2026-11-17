"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { formSummaries } from "@/features/projects/requests-view";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useRights } from "../../parts";
import { useText } from "./useText";
import styles from "./Inbox.module.css";

/** Where a shared form is answered: REQ-C1's page, app/[company]/(app)/forms/[formId]. `prefix` is the company's URL prefix (href("")). */
export const formLink = (prefix: string, formId: string): string => `${prefix}/forms/${formId}`;
export function FormsPanel({ p, forms }: { p: ReducedProject; forms: ReturnType<typeof formSummaries> }) {
  const { href } = useDemo();
  const t = useT();
  const { text } = useText();
  const rights = useRights(p);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (formId: string) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + formLink(href(""), formId));
      setCopied(formId);
      setTimeout(() => setCopied((now) => (now === formId ? null : now)), 2000);
    } catch { /* the browser refused the clipboard: nothing to show */ }
  };
  const open = (formId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("form", formId); // the builder of REQ-B1 reads ?form=<id>, or ?form=new
    window.location.assign(url.pathname + url.search);
  };

  return (
    <aside className={styles.side} aria-labelledby={"forms-" + p.id}>
      <div className={styles.sideHead}>
        <h3 id={"forms-" + p.id} className={styles.title}>{t("projectRequests.forms")}</h3>
        {rights.addStep && <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => open("new")}>{text("formNew")}</button>}
      </div>
      {forms.map(({ form, answers, fresh }) => (
        <div key={form.id} className={styles.formRow} data-draft={!form.shared}>
          <span>
            <span className={styles.formName}>{form.title}</span>
            <span className={styles.muted}>{form.shared ? text("formAnswers", { answers, fresh }) : text("formDraftHint")}</span>
          </span>
          <span className={styles.actions}>
            {form.shared && <button type="button" className={styles.link} onClick={() => void copy(form.id)}>{copied === form.id ? text("formCopied") : text("formCopy")}</button>}
            {rights.addStep && <button type="button" className={styles.link} onClick={() => open(form.id)}>{text("formEdit")}</button>}
          </span>
        </div>
      ))}
    </aside>
  );
}
