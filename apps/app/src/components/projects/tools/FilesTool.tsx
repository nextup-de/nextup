"use client";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { extOf } from "@/features/ideas/brief";
import { loadRaised } from "@/lib/raised";
import { loadShots } from "@/lib/shots";
import { useT } from "@/i18n/client";
import { FilesPanel, OriginPanel } from "../ProjectOrigin";
import { ToolsPanel } from "../ProjectTeam";
import { FilesView } from "../files/FilesView";
import { listDemoFolder } from "@/features/demo/files-demo";
import { projectFolderAction } from "@/server/actions/project-files";
import { useRights } from "../parts";
import { useCallback } from "react";
import type { ToolProps } from "./types";
import s from "../hub/content/content.module.css";
import styles from "../Projects.module.css";

export function FilesTool({ p, jira }: ToolProps) {
  const t = useT();
  const { S, seed, tenant, f, serverMode } = useDemo();
  const rights = useRights(p);
  const load = useCallback((path: string, next?: string | null) => (serverMode ? projectFolderAction(p.id, path, next) : Promise.resolve(listDemoFolder(path))), [serverMode, p.id]);
  const briefs = { ...seed.briefs, ...loadRaised(tenant.slug) };
  const files = p.sources.flatMap((id) => {
    const source = S.cases.find((c) => c.id === id);
    const meta = source ? [source.from, f(source.raisedDay)].filter(Boolean).join(" · ") : S.ideas.find((idea) => idea.id === id)?.proposedBy ?? "";
    return [
      ...(briefs[id]?.files ?? []).map((file) => ({ name: file.name, ext: extOf(file.name), meta: [file.size, meta].filter(Boolean).join(" · ") })),
      ...loadShots(tenant.slug, id).map((shot) => ({ name: shot.name, ext: extOf(shot.name), meta })),
    ];
  });
  return <div className={s.files}>
    <FilesView p={p} load={load} editor={rights.addStep} />
    <OriginPanel p={p} />
    {!!files.length && <section aria-label={t("projectHub.filesAttachments")}>
      <h2 className={styles.h2}>{t("projectHub.filesAttachments")}</h2>
      <ul>{files.map((file, index) => <li key={file.name + index} className={s.row}>
        <span className={s.badge}>{file.ext}</span>
        <div className={s.name}>{file.name}<span className={s.meta}>{file.meta}</span></div>
      </li>)}</ul>
    </section>}
    {!files.length && <FilesPanel p={p} />}
    <ToolsPanel p={p} jira={jira} />
  </div>;
}
