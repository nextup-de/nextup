"use client";
import type { ToolProps } from "./types";
import { Inbox } from "../requests/inbox/Inbox";

export function RequestsTool({ p, page, tool }: ToolProps) {
  return <Inbox p={p} page={page} tool={tool} />;
}
