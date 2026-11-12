// Q9.1 in the setup overview: "We do not use this" on the optional lines of phases 2 and 3, and the Teams line.
import { describe, expect, it } from "vitest";
import type { GoLiveInput } from "@/features/pilot/go-live";
import { setupPhases, type ItFacts, type PhaseKey, type SetupFacts } from "@/features/settings/setup-phases";

const NOW = new Date("2026-11-05T12:00:00Z");
const HOUR = 3_600_000;

/** A company with everything finished and everything on: each test switches off what it is about. */
const GO_LIVE: GoLiveInput = {
  now: NOW,
  units: [{ name: "Plant" }],
  roles: [{ title: "Lead", holders: 1 }],
  routes: [{ key: "spend", ownerHasUser: true }],
  hasCalendar: true,
  people: { active: 3, canSignIn: 3 },
  microsoftOn: true,
  managers: { withCode: 1, withTotp: 1 },
  mail: "ok",
  ai: { choice: "off", dpaSignedAt: null },
  backup: { at: new Date(NOW.getTime() - HOUR), offbox: true },
  supportOpenUntil: null,
  notifications: true,
  directory: { on: true, lastRunAt: NOW, lastOkAt: new Date(NOW.getTime() - HOUR), lastError: null },
  recipients: 1,
  baseline: true,
  agreements: {
    dpa: { kind: "dpa", status: "signed", date: "2026-10-01", signer: "Managing director", at: "2026-10-01T09:00:00.000Z" },
    works: { kind: "works", status: "notNeeded", reason: "No works council", at: "2026-10-01T09:00:00.000Z" },
  },
};
const ON: ItFacts["connectors"] = { m365: "on", jira: "on", ai: "off", directory: "on", teams: "on" };
const OFF: ItFacts["connectors"] = { m365: "off", jira: "off", ai: "off", directory: "off", teams: "off" };
const D = { at: "2026-11-03T10:00:00.000Z", reason: "Projects stay in SAP PS" };

const facts = (o: { goLive?: Partial<GoLiveInput>; connectors?: Partial<ItFacts["connectors"]>; declined?: ItFacts["declined"]; openedAt?: Date | null } = {}): SetupFacts => ({
  viewer: "stackAdmin",
  prefix: "/acme",
  goLive: { ...GO_LIVE, ...o.goLive },
  it: { consoleBase: "/admin", admins: 1, connectors: { ...ON, ...o.connectors }, declined: o.declined ?? {} },
  counts: { named: true, units: 1, seats: 1, routes: 1, members: 3 },
  openedAt: o.openedAt === undefined ? new Date("2026-11-01T00:00:00Z") : o.openedAt,
  context: "notUsed",
});
const phase = (f: SetupFacts, key: PhaseKey) => {
  const found = setupPhases(f).find((p) => p.key === key);
  if (!found) throw new Error(`no phase ${key}`);
  return found;
};
const lineOf = (f: SetupFacts, key: PhaseKey, line: string) => phase(f, key).lines.find((l) => l.key === line);
const lineKeys = (f: SetupFacts, key: PhaseKey) => phase(f, key).lines.map((l) => l.key);

describe("setup: we do not use this", () => {
  it("offers it on each optional line not in use, and on none that is on", () => {
    const off = facts({ connectors: OFF, goLive: { microsoftOn: false } });
    for (const [p, l] of [["signIn", "entra"], ["signIn", "directory"], ["connectors", "m365"], ["connectors", "teams"], ["connectors", "jira"], ["connectors", "ai"]] as const) {
      expect(lineOf(off, p, l)?.decline, l).toEqual({ system: l, declined: false });
    }
    const on = facts({ goLive: { ai: { choice: "azure-openai", dpaSignedAt: NOW } }, connectors: { ai: "on" } });
    for (const p of setupPhases(on)) for (const l of p.lines) expect(l.decline, `${p.key}.${l.key}`).toBeUndefined();
  });

  it("is not offered for a failing Jira or an AI that still blocks Open", () => {
    expect(lineOf(facts({ connectors: { jira: "error" } }), "connectors", "jira")?.decline).toBeUndefined();
    expect(lineOf(facts({ goLive: { ai: { choice: "mock", dpaSignedAt: null } } }), "connectors", "ai")?.decline).toBeUndefined();
    expect(lineOf(facts({ connectors: { ai: "needs" }, goLive: { ai: { choice: "azure-openai", dpaSignedAt: null } } }), "connectors", "ai")?.decline).toBeUndefined();
  });

  it("turns Microsoft sign-in from your turn into not used, with the date and the reason", () => {
    const before = facts({ goLive: { microsoftOn: false } });
    expect(lineOf(before, "signIn", "entra")?.status).toBe("yourTurn");
    const after = facts({ goLive: { microsoftOn: false }, declined: { entra: D } });
    expect(lineOf(after, "signIn", "entra")).toEqual({
      key: "entra", status: "notUsed", line: "settingsSetupPhases.lineDeclined",
      values: { systemKey: "settingsSetupPhases.systemEntra", date: D.at, reason: D.reason }, decline: { system: "entra", declined: true },
    });
    expect(phase(after, "signIn").status).toBe("done");
  });

  it("stops asking for a decision once every system that is off has one", () => {
    expect(lineKeys(facts({ connectors: OFF, declined: { m365: D, jira: D } }), "connectors")).toContain("none");
    const all = facts({ connectors: OFF, declined: { m365: D, jira: D, teams: D, ai: D } });
    expect(lineKeys(all, "connectors")).not.toContain("none");
    expect(phase(all, "connectors").status).toBe("notUsed");
  });

  it("ignores a decision once the system is on", () => {
    expect(lineOf(facts({ declined: { jira: D } }), "connectors", "jira")).toEqual({ key: "jira", status: "done", line: "settingsSetupPhases.lineJiraOn" });
  });

  it("never opens anything: the needed checks of Open stay what they are", () => {
    const every = { entra: D, directory: D, teams: D, jira: D, m365: D, ai: D };
    const f = facts({ connectors: OFF, declined: every, openedAt: null, goLive: { microsoftOn: false, hasCalendar: false } });
    expect(phase(f, "open").lines[0]).toMatchObject({ key: "checks", values: { count: 1 } });
  });

  it("shows Teams in the connectors phase, on or off", () => {
    expect(lineOf(facts(), "connectors", "teams")).toMatchObject({ status: "done", line: "settingsSetupPhases.lineTeamsOn" });
    expect(lineOf(facts({ connectors: { teams: "off" } }), "connectors", "teams")).toMatchObject({ status: "notUsed", line: "settingsSetupPhases.lineTeamsOff" });
  });
});
