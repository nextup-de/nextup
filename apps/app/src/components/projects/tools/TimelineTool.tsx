"use client";
import { Timeline } from "../plan/timeline/Timeline";
import type { ToolProps } from "./types";

export function TimelineTool({ p, jira, page, tool }: ToolProps) {
  return <Timeline p={p} jira={jira} page={page} tool={tool} />;
}
