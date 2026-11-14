import type { PageHeadProps } from "@/components/ui/elements/PageHead";
import { projectFolder } from "@/features/files/link";
import type { ReducedProject } from "@/features/projects/types";
import type { MessageKey } from "@/i18n";

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

/** The header of the Files page: the title, the SharePoint pill and 'Open in SharePoint ↗' while the project has a folder, and + Upload. */
export function filesHead(p: Pick<ReducedProject, "links">, t: T, o: { onUpload: () => void; canUpload: boolean; syncedAgo?: string; onOpenSource?: () => void }): PageHeadProps {
  const folder = projectFolder(p);
  return {
    title: t("projectFiles.title"),
    ...(folder ? {
      source: { system: "sharepoint", label: t("projectFiles.sharepoint"), state: "ok" as const, ...(o.syncedAgo ? { syncedAt: t("projectFiles.synced", { ago: o.syncedAgo }) } : {}), ...(o.onOpenSource ? { onOpen: o.onOpenSource } : {}) },
      open: { label: t("projectFiles.openInSharePoint"), href: folder.url },
    } : {}),
    ...(o.canUpload ? { primary: { label: t("projectFiles.upload"), icon: "+", onClick: o.onUpload } } : {}),
  };
}
