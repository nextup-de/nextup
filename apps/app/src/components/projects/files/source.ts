"use client";
import { useMemo } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { demoVersions, listDemoFolder } from "@/features/demo/files-demo";
import { isSampleId } from "@/features/demo/sample-data";
import type { VersionsAnswer } from "@/features/files/items";
import { fileVersionsAction, projectFolderAction } from "@/server/actions/project-files";
import type { FilesLoad } from "./types";

export type FilesSource = {
  /** The files are the demo tree in this browser (features/demo/files-demo.ts): nothing is asked of the server. */
  demo: boolean;
  list: FilesLoad;
  versions: (itemId: string) => Promise<VersionsAnswer>;
};

/**
 * Where a project's files are read. The static demo has no server behind it; and with a session, a project of the sample data
 * lives in this browser only (features/demo/sample-data.ts), so the server would answer no-access for a project it has never seen.
 * Both read the demo tree. Every other project reads its SharePoint folder through the server, as the person who looks.
 */
export function useFilesSource(projectId: string): FilesSource {
  const { serverMode } = useDemo();
  const demo = !serverMode || isSampleId(projectId);
  return useMemo<FilesSource>(() => (demo
    ? { demo, list: (path) => Promise.resolve(listDemoFolder(path)), versions: (itemId) => Promise.resolve(demoVersions(itemId)) }
    : { demo, list: (path, next) => projectFolderAction(projectId, path, next), versions: (itemId) => fileVersionsAction(projectId, itemId) }), [demo, projectId]);
}
