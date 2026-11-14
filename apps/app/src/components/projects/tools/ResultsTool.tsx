"use client";
import type { ToolProps } from "./types";
import { Results } from "../hub/results/Results";

export function ResultsTool({ p }: ToolProps) {
  return <Results p={p} />;
}
