"use client";
import { Board } from "../steps/board/Board";
import type { ToolProps } from "./types";

export function BoardTool(props: ToolProps) {
  return <Board {...props} />;
}
