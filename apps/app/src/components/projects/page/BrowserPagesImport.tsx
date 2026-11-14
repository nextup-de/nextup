"use client";
import type { ReducedProject } from "@/features/projects/types";

export type BrowserPagesImportProps = { p: ReducedProject; editor: boolean };

/** The browser import banner fills this stand-in in PGB-D1. */
export function BrowserPagesImport(props: BrowserPagesImportProps) {
  void props;
  return null;
}
