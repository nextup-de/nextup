// The agent area of the loop mails (REG/D10; plan AGT, D12, D14): an accepted Unblock is one notice, to the step's owner or the people of its
// role, with the nudge as the lead sent it and the line that says it was drafted with AI. Nothing else the agent writes sends a notice: a
// suggestion, a dismissal and a switch are the lead's and no one else's business, and an accepted Report or Plan notifies through the update
// and the step it writes (MOV's notices). The recipients are in the event (the server read them from the current project), never the client's.
import { projectLabel } from "@/features/projects/selectors";
import type { NoticeBuilder, NoticeBuilders } from "./shared";

const agentAcceptedNotice: NoticeBuilder = ({ ev, pl, project, send, projectLink, find }) => {
  if (pl.suggestionKind !== "unblock" || !project || typeof pl.text !== "string" || pl.text.trim() === "") return;
  const step = project.steps.find((s) => s.id === pl.stepId);
  const title = step?.text ?? project.title;
  for (const who of Array.isArray(pl.toUserIds) ? pl.toUserIds : []) {
    send(who, (t) => t("projectAgent.nudgeSubject", { step: title }), (t) => [
      pl.text as string, "", t("projectAgent.draftedBy", { name: find(ev.actorUserId)?.name || ev.actor }), "", t("projectAgent.nudgeProject", { label: projectLabel(project), title: project.title }), projectLink(project),
    ]);
  }
};

export const AGENT_NOTICES: NoticeBuilders = { "agent.accepted": agentAcceptedNotice };
