import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { consoleTodo } from "@/features/admin/console-overview";
import { ConsoleOverview } from "@/components/admin/CompanyOverview";
import type { ConsoleOverviewFacts } from "@/server/console-guard";
import type { CompanyRow } from "@/features/admin/rows";
import { createT } from "@/i18n";

const ok = { admins: 2, entra: true, connectors: { m365: true } };

const facts = (over: Partial<ConsoleOverviewFacts> = {}): ConsoleOverviewFacts => ({
  admins: 2, entra: true, jira: true, assistant: true, support: null,
  connectors: { jira: true, m365: true, ai: false }, via: "stack-admin", ...over,
});
const company = { name: "Acme" } as CompanyRow;
const render = (f: ConsoleOverviewFacts, locale: "en" | "de" = "en") =>
  renderToStaticMarkup(ConsoleOverview({ company, facts: f, base: "/admin", t: createT(locale) }));

describe("ITC console overview", () => {
  it("consoleTodo asks for a personal login when there are no admins", () => {
    const personal = consoleTodo({ ...ok, admins: 0 }, "stack-admin");
    expect(personal.map((l) => l.key)).toEqual(["adminConsole.todoNoAdmin"]);
    expect(personal[0].href).toBe("/people");
    const shared = consoleTodo({ ...ok, admins: 0 }, "break-glass");
    expect(shared.map((l) => l.key)).toEqual(["adminConsole.todoNoAdmin", "adminConsole.todoNoAdminHint"]);
  });

  it("consoleTodo is empty when all is set up, and flags Microsoft 365 with Entra off", () => {
    expect(consoleTodo(ok, "entra")).toEqual([]);
    expect(consoleTodo({ ...ok, entra: false }, "entra")).toEqual([{ key: "adminConsole.todoEntraOff", href: "/people" }]);
    expect(consoleTodo({ ...ok, entra: false, connectors: { m365: false } }, "entra")).toEqual([]);
  });

  it("words the tiles as state, with connectors and an open support line", () => {
    const html = render(facts({ support: { until: new Date("2026-11-03T13:30:00Z") } }));
    expect(html).toContain("Connectors: Jira, Microsoft 365");
    expect(html).toContain("2 console admins");
    expect(html).toContain("Microsoft sign-in: on");
    expect(html).toContain("Support access open until 14:30");
    expect(html).toContain('href="/admin/support"');
    expect(html).toContain("Nothing to do.");
    expect(html).not.toMatch(/>On</);
  });

  it("shows no support, off states and a to-do with no admins", () => {
    const html = render(facts({ admins: 0, entra: false, assistant: false, via: "break-glass", connectors: { jira: false, m365: false, ai: false } }));
    expect(html).toContain("No support access open");
    expect(html).toContain("Connectors: none");
    expect(html).toContain("Assistant: off");
    expect(html).toContain("Nobody has a personal console login yet");
    expect(html).not.toContain("Nothing to do.");
    expect(render(facts({ admins: 0, entra: false }), "de")).toContain("Zu erledigen");
  });
});
