"use client";
import { List } from "../steps/list/List";
import type { ToolProps } from "./types";

export function ListTool(props: ToolProps) {
  return <List {...props} />;
}
