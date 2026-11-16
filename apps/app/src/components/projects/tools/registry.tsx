"use client";
import type { JSX } from "react";
import type { ToolKind } from "@/features/projects/types";
import type { ToolProps } from "./types";
import dynamic from "next/dynamic";
import { IdeaTool } from "./IdeaTool";
import { OverviewTool } from "./OverviewTool";
import { BoardTool } from "./BoardTool";
import { ListTool } from "./ListTool";
import { CalendarTool } from "./CalendarTool";
import { TimelineTool } from "./TimelineTool";
import { MilestonesTool } from "./MilestonesTool";
import { ResultsTool } from "./ResultsTool";
import { FilesTool } from "./FilesTool";
import { DocTool } from "./DocTool";
import { ChecklistTool } from "./ChecklistTool";
import { TableTool } from "./TableTool";
import { LinksTool } from "./LinksTool";
import { RequestsTool } from "./RequestsTool";
import { TeamTool } from "./TeamTool";
import { ActivityTool } from "./ActivityTool";
import { ArchiveTool } from "./ArchiveTool";
import { BacklogTool } from "./BacklogTool";
import { ReportsTool } from "./ReportsTool";

const AgentTool = dynamic(() => import("./AgentTool").then((m) => m.AgentTool));

export const TOOL_REGISTRY: Record<ToolKind, (p: ToolProps) => JSX.Element> = {
  idea: IdeaTool,
  overview: OverviewTool,
  board: BoardTool,
  list: ListTool,
  calendar: CalendarTool,
  timeline: TimelineTool,
  milestones: MilestonesTool,
  results: ResultsTool,
  files: FilesTool,
  doc: DocTool,
  checklist: ChecklistTool,
  table: TableTool,
  links: LinksTool,
  requests: RequestsTool,
  team: TeamTool,
  archive: ArchiveTool,
  backlog: BacklogTool,
  reports: ReportsTool,
  activity: ActivityTool,
  agent: (props) => <AgentTool {...props} />,
};
