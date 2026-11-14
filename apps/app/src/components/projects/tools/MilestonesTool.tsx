"use client";
import { Milestones } from "../plan/milestones/Milestones";
import type { ToolProps } from "./types";

export function MilestonesTool(props: ToolProps) {
  return <Milestones {...props} />;
}
