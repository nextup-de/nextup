"use client";
// The Idea page of a project: the idea it grew from, the way the idea's own page shows it (head card with its
// stages and desk, then the idea and its AI view). An idea and its project are one thing to the people on it,
// so the project opens on this. A project that grew from no idea says so.
import { DashboardView } from "@/components/dashboard/team/DashboardView";
import { useT } from "@/i18n/client";
import type { ToolProps } from "./types";
import s from "./ToolRows.module.css";

export function IdeaTool({ p }: ToolProps) {
  const t = useT();
  const source = p.sources[0] ?? null;
  if (!source) return <p className={s.ideaNone}>{t("projectPages.ideaNone")}</p>;
  return <DashboardView key={source} caseId={source} linkCases inPage />;
}
