"use client";
import type { ToolProps } from "./types";
import { Team } from "../hub/team/Team";

export function TeamTool({ p }: ToolProps) {
  return <Team p={p} />;
}
