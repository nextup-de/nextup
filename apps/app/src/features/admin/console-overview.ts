// What the console's front page tells the admin to do (ITC-H1). Pure: facts in, message keys and link
// targets out; the page words them and prefixes the base path.
import type { MessageKey } from "@/i18n";

/** The facts the to-do reads; ConsoleOverviewFacts (server/console-guard.ts) fits it. */
export type TodoFacts = {
  admins: number;
  entra: boolean;
  connectors: { m365: boolean };
};

/** How the viewer came in; "break-glass" is the shared code. */
export type TodoVia = "entra" | "stack-admin" | "break-glass" | "support";

export type TodoLine = { key: MessageKey; href: string };

export function consoleTodo(facts: TodoFacts, via: TodoVia): TodoLine[] {
  const lines: TodoLine[] = [];
  if (facts.admins === 0) {
    lines.push({ key: "adminConsole.todoNoAdmin", href: "/people" });
    if (via === "break-glass") lines.push({ key: "adminConsole.todoNoAdminHint", href: "/people" });
  }
  if (facts.connectors.m365 && !facts.entra) lines.push({ key: "adminConsole.todoEntraOff", href: "/people" });
  return lines;
}
