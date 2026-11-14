"use client";
import { Timeline } from "../plan/timeline/Timeline";
import type { ToolProps } from "./types";

export function TimelineTool({ p, jira }: ToolProps) {
  return <Timeline p={p} jira={jira} />;
}
