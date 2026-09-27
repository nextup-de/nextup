// The sidebar carries state, so these are the rules for when it shouts. A badge that is always there
// is wallpaper; the point is that "3 stuck" only appears when three are stuck.
import { describe, expect, it } from "vitest";
import { adminBase, adminNav, connectionProblems } from "@/features/admin/nav";
import { nextStage, STAGES, isStage } from "@/features/admin/stages";
import type { TaskCounts } from "@/features/integrations/tasks";

const counts = (over: Partial<TaskCounts> = {}): TaskCounts => ({
  done: 0,
  skipped: 0,
  pending: 0,
  failed: 0,
  ...over,
});

const base = {
  database: "up" as const,
  openRequests: 0,
  overdueRequests: 0,
  companies: 1,
  automation: "live" as const,
  tasks: counts({ done: 3 }),
  mail: "up" as const,
};

const item = (facts: typeof base | Parameters<typeof adminNav>[0], id: string) => adminNav(facts).find((i) => i.id === id);

describe("adminNav", () => {
  it("is six pages, and quiet when everything is fine", () => {
    const items = adminNav(base);
    expect(items.map((i) => i.id)).toEqual(["overview", "requests", "companies", "knowledge", "decisions", "connections"]);
    expect(items.map((i) => i.path)).toEqual(["", "/requests", "/companies", "/knowledge", "/decisions", "/connections"]);
    expect(items.filter((i) => i.tone === "bad" || i.tone === "warn")).toEqual([]);
    expect(item(base, "connections")).toMatchObject({ badge: null, tone: "ok" });
  });

  it("counts unanswered requests, says nothing at zero, and shouts about overdue ones", () => {
    expect(item({ ...base, openRequests: 2 }, "requests")).toMatchObject({ badge: "2", tone: "warn" });
    expect(item(base, "requests")?.badge).toBeNull();
    expect(item({ ...base, openRequests: 3, overdueRequests: 1 }, "requests")).toMatchObject({ badge: "1 overdue", tone: "bad" });
  });

  it("puts the worst connection problem on the Connections badge", () => {
    expect(item({ ...base, database: "down", automation: null, tasks: null }, "connections")).toMatchObject({ badge: "db down", tone: "bad" });
    expect(item({ ...base, tasks: counts({ failed: 3, pending: 1 }) }, "connections")).toMatchObject({ badge: "3 stuck", tone: "bad" });
    expect(item({ ...base, tasks: counts({ pending: 1 }) }, "connections")).toMatchObject({ badge: "1 sending", tone: "warn" });
    expect(item({ ...base, automation: "idle" }, "connections")).toMatchObject({ badge: "notices idle", tone: "warn" });
    expect(item({ ...base, mail: "down" }, "connections")).toMatchObject({ badge: "mail down", tone: "bad" });
  });

  it("does not count mail that is simply not configured - replies fall back to a mail app", () => {
    expect(connectionProblems({ ...base, mail: "off" })).toEqual([]);
  });

  it("says a dead relay once, not again as notices down - notices go out through it", () => {
    expect(connectionProblems({ ...base, automation: "unreachable", mail: "down" })).toEqual([
      { badge: "mail down", tone: "bad" },
    ]);
  });

  it("warns when notices are off, because then a raise tells nobody", () => {
    expect(item({ ...base, automation: "off", mail: "off" }, "connections")).toMatchObject({ badge: "notices off", tone: "warn" });
  });

  it("lists bad before warn", () => {
    const tones = connectionProblems({ ...base, automation: "off", mail: "down" }).map((p) => p.tone);
    expect(tones).toEqual(["bad", "warn"]);
  });
});

describe("adminBase", () => {
  it("is /admin in path mode and the host root on the admin subdomain", () => {
    expect(adminBase("path")).toBe("/admin");
    expect(adminBase(undefined)).toBe("/admin");
    expect(adminBase("subdomain")).toBe("");
  });
});

describe("stages", () => {
  it("walks demo -> sandbox -> pilot -> live and stops there", () => {
    expect(nextStage("demo")).toBe("sandbox");
    expect(nextStage("sandbox")).toBe("pilot");
    expect(nextStage("pilot")).toBe("live");
    expect(nextStage("live")).toBeNull();
  });

  it("has no next step for something that is not a stage", () => {
    expect(nextStage("banana")).toBeNull();
    expect(isStage("banana")).toBe(false);
    expect(STAGES.every(isStage)).toBe(true);
  });
});
