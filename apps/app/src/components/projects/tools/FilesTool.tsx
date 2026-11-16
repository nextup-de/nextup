"use client";
import { useCallback } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { listDemoFolder } from "@/features/demo/files-demo";
import { projectFolderAction } from "@/server/actions/project-files";
import { FilesView } from "../files/FilesView";
import { useRights } from "../parts";
import type { ToolProps } from "./types";

/** The Files tool is the file browser and nothing else (Paper "Files · 3"): the idea, the sources and the connected tools open from the page's gear. */
export function FilesTool({ p }: ToolProps) {
  const { serverMode } = useDemo();
  const rights = useRights(p);
  const load = useCallback((path: string, next?: string | null) => (serverMode ? projectFolderAction(p.id, path, next) : Promise.resolve(listDemoFolder(path))), [serverMode, p.id]);
  return <FilesView p={p} load={load} editor={rights.addStep} />;
}
