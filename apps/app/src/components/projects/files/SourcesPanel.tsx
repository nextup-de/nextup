"use client";
// What the project grew from, in the Files page's Sources sheet (frame 7.2): the files raised with its ideas and
// problems, and the links back to them. Before the gear this stacked under the file browser (FilesTool).
import { useDemo } from "@/components/dashboard/DemoProvider";
import { extOf } from "@/features/ideas/brief";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { loadRaised } from "@/lib/raised";
import { loadShots } from "@/lib/shots";
import { FilesPanel } from "../ProjectOrigin";
import s from "../hub/content/content.module.css";
import styles from "../Projects.module.css";

/** The files raised with the project's sources: brief attachments and screenshots, with who raised them and when. */
export function useRaisedFiles(p: ReducedProject) {
  const { S, seed, tenant, f } = useDemo();
  const briefs = { ...seed.briefs, ...loadRaised(tenant.slug) };
  return p.sources.flatMap((id) => {
    const source = S.cases.find((c) => c.id === id);
    const meta = source ? [source.from, f(source.raisedDay)].filter(Boolean).join(" · ") : S.ideas.find((idea) => idea.id === id)?.proposedBy ?? "";
    return [
      ...(briefs[id]?.files ?? []).map((file) => ({ name: file.name, ext: extOf(file.name), meta: [file.size, meta].filter(Boolean).join(" · ") })),
      ...loadShots(tenant.slug, id).map((shot) => ({ name: shot.name, ext: extOf(shot.name), meta })),
    ];
  });
}

export function SourcesPanel({ p }: { p: ReducedProject }) {
  const t = useT();
  const files = useRaisedFiles(p);
  return <div className={s.files}>
    {!!files.length && <section aria-label={t("projectHub.filesAttachments")}>
      <h2 className={styles.h2}>{t("projectHub.filesAttachments")}</h2>
      <ul>{files.map((file, index) => <li key={file.name + index} className={s.row}>
        <span className={s.badge}>{file.ext}</span>
        <div className={s.name}>{file.name}<span className={s.meta}>{file.meta}</span></div>
      </li>)}</ul>
    </section>}
    <FilesPanel p={p} />
  </div>;
}
