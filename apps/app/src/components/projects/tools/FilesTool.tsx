"use client";
import { FilesView } from "../files/FilesView";
import { useFilesSource } from "../files/source";
import { useRights } from "../parts";
import type { ToolProps } from "./types";

/** The Files tool is the file browser and nothing else (Paper "Files · 3"): the idea, the sources and the connected tools open from the page's gear. */
export function FilesTool({ p }: ToolProps) {
  const rights = useRights(p);
  const { list } = useFilesSource(p.id);
  return <FilesView p={p} load={list} editor={rights.addStep} />;
}
