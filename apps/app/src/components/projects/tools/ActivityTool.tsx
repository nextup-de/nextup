"use client";
import type { ToolProps } from "./types";
import { Activity } from "../hub/team/Activity";

export function ActivityTool({ p }: ToolProps) {
  return <Activity p={p} />;
}
