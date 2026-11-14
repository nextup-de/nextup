"use client";
import { AgentTab } from "../agent/AgentTab";
import { useAgentTab } from "../agent/useAgentTab";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

export function AgentTool({ p }: ToolProps) {
  const agent = useAgentTab(p, true);
  return <div className={styles.tabCards}>{agent.view && <AgentTab p={p} view={agent.view} failed={agent.failed} />}</div>;
}
