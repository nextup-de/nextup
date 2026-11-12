"use client";
// The template picker of a draft (D16): the three templates with their steps and the title. One template is in use at
// a time; "Change template" is possible until the start, and steps nobody touched swap with it (Q5.5).
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { DraftView } from "@/features/projects/draft";
import type { ReducedProject } from "@/features/projects/types";
import { latestTemplate, type TemplateKey } from "@/features/templates/library";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import styles from "./Draft.module.css";

const KEYS: readonly { key: TemplateKey; name: "projectDraft.tpl_quickWin" | "projectDraft.tpl_eightD" | "projectDraft.tpl_investment" }[] = [
  { key: "quick-win", name: "projectDraft.tpl_quickWin" },
  { key: "8d", name: "projectDraft.tpl_eightD" },
  { key: "investment", name: "projectDraft.tpl_investment" },
];

export function DraftTemplate({ p, view }: { p: ReducedProject; view: DraftView }) {
  const { act } = useDemo();
  const t = useT();
  const send = useSend(p);
  const [changing, setChanging] = useState(false);
  const [title, setTitle] = useState(p.title);
  const may = view.may.pickTemplate;
  const picking = p.template === null || changing;

  const pick = (key: TemplateKey) => {
    const tpl = latestTemplate(key);
    if (!tpl) return;
    const named = title.trim() !== "" && title.trim() !== p.title ? title.trim() : undefined;
    if (send("project.template", { key, version: tpl.version, ...(named ? { title: named } : {}) }, () => act.project.pickTemplate(p.id, key, tpl.version, named))) setChanging(false);
  };

  return (
    <section className={styles.section} aria-labelledby={"template-" + p.id}>
      <div className={styles.head}>
        <h2 id={"template-" + p.id} className={styles.h2}>{t("projectDraft.templateTitle")}</h2>
        {may && p.template !== null && !changing && <button type="button" className={styles.quiet} onClick={() => setChanging(true)}>{t("projectDraft.templateChange")}</button>}
      </div>
      <p className={styles.muted}>{t("projectDraft.templateLede")}</p>
      {may && picking && (
        <label className={styles.field}>
          <span className={styles.label}>{t("projectDraft.templateTitleLabel")}</span>
          <input className={`nh-input ${styles.input}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
      )}
      <ul className={styles.templates}>
        {KEYS.filter((k) => picking || p.template?.key === k.key).map((k) => {
          const tpl = latestTemplate(k.key);
          if (!tpl) return null;
          const inUse = p.template?.key === k.key;
          return (
            <li key={k.key} className={styles.template} data-active={inUse ? "true" : undefined}>
              <div className={styles.head}>
                <h3 className={styles.h3}>{t(k.name)}</h3>
                <span className={styles.muted}>{inUse ? t("projectDraft.templateInUse") : t("projectDraft.templateStepCount", { count: tpl.steps.length })}</span>
              </div>
              <ol className={styles.tplSteps}>
                {tpl.steps.map((s, i) => (
                  <li key={i}>
                    <span>{s.text}</span>
                    <span className={styles.muted}> · {t(("projectDraft.stepRole_" + s.role) as "projectDraft.stepRole_lead")} · {t("projectDraft.templateStepDay", { day: s.day })}</span>
                  </li>
                ))}
              </ol>
              {may && picking && !inUse && <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => pick(k.key)}>{t("projectDraft.templateUse")}</button>}
            </li>
          );
        })}
      </ul>
      {may && picking && p.template !== null && <p className={styles.hint}>{t("projectDraft.templateKeep")}</p>}
    </section>
  );
}
