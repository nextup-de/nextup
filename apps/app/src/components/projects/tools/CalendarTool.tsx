"use client";
import { Calendar } from "../plan/calendar/Calendar";
import type { ToolProps } from "./types";

export function CalendarTool(props: ToolProps) {
  return <Calendar {...props} />;
}
