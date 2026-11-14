import type { ProjectPage, ReducedProject, ToolInstance } from "@/features/projects/types";
import type { JiraRow, StepHint } from "@/features/projects/views";

export type ToolProps = {
  p: ReducedProject;
  tool: ToolInstance;
  page: ProjectPage;
  jira: JiraRow;
  editor: boolean;
  hints: StepHint[];
};
