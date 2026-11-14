"use client";
import type { ToolProps } from "../tools/types";
import { TOOL_REGISTRY } from "../tools/registry";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";

export type ToolSectionProps = ToolProps & {
  index: number;
  count: number;
  onAddAt: (index: number) => void;
};

/** The section controls fill this stand-in in PGB-B2; tool bodies stay in the registry. */
export function ToolSection({ p, page, tool, jira, editor, hints }: ToolSectionProps) {
  const t = useT();
  const Tool = TOOL_REGISTRY[tool.kind];
  const name = `projectPages.tool${tool.kind[0].toUpperCase()}${tool.kind.slice(1)}` as MessageKey;
  return <section>
    <h2>{tool.title ?? t(name)}</h2>
    <Tool p={p} page={page} tool={tool} jira={jira} editor={editor} hints={hints} />
  </section>;
}
