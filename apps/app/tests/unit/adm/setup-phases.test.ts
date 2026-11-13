import { describe, expect, it } from "vitest";
import type { GoLiveInput } from "@/features/pilot/go-live";
import { resumeHref, setupIsWaiting, setupPhases, type ItFacts, type PhaseKey, type SetupFacts } from "@/features/settings/setup-phases";

const NOW = new Date("2026-11-05T12:00:00Z");
const HOUR = 3_600_000;

/** A company with everything finished: each test breaks the one thing it is about. */
/** The agreements an AI that is on needs (Q9.4): the DPA, the works agreement and the information about the AI. */
const AGREEMENTS: GoLiveInput["agreements"] = {
  dpa: { kind: "dpa", status: "signed", date: "2026-10-01", signer: "Managing director", at: "2026-10-01T09:00:00.000Z" },
  works: { kind: "works", status: "signed", date: "2026-10-02", signer: "Works council chair", at: "2026-10-02T09:00:00.000Z" },
  aiInfo: { kind: "aiInfo", status: "signed", date: "2026-10-03", signer: "Plant manager", at: "2026-10-03T09:00:00.000Z" },
};
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
  ai: { choice: "azure-openai", dpaSignedAt: new Date("2026-10-01T00:00:00Z") },
  backup: { at: new Date(NOW.getTime() - HOUR), offbox: true },
  supportOpenUntil: null,
  notifications: true,
  directory: { on: true, lastRunAt: NOW, lastOkAt: new Date(NOW.getTime() - HOUR), lastError: null },
  recipients: 1,
  baseline: true,
  restore: { at: new Date(NOW.getTime() - 86_400_000), seconds: 300 }, findings: null, breakGlassUntil: null,
  agreements: AGREEMENTS,
};
const IT: ItFacts = { consoleBase: "/admin", admins: 1, connectors: { m365: "on", jira: "on", ai: "on", directory: "on", teams: "on" }, declined: {} };
const FACTS: SetupFacts = {
  viewer: "both",
  prefix: "/acme",
  goLive: GO_LIVE,
  it: IT,
  counts: { named: true, units: 1, seats: 1, routes: 1, members: 3 },
  openedAt: new Date("2026-11-01T00:00:00Z"),
  context: "notUsed",
};

const phase = (f: Partial<SetupFacts>, key: PhaseKey) => {
  const found = setupPhases({ ...FACTS, ...f }).find((p) => p.key === key);
  if (!found) throw new Error(`no phase ${key}`);
  return found;
};
const goLive = (g: Partial<GoLiveInput>) => ({ goLive: { ...GO_LIVE, ...g } });
const connectors = (c: Partial<ItFacts["connectors"]>) => ({ it: { ...IT, connectors: { ...IT.connectors, ...c } } });
const lineKeys = (p: { lines: { key: string }[] }) => p.lines.map((l) => l.key);

describe("setupPhases: which phases show", () => {
  it("has six phases in the plan's order on a one-company stack", () => {
    expect(setupPhases(FACTS).map((p) => p.key)).toEqual(["server", "signIn", "connectors", "context", "company", "open"]);
  });

  it("drops the IT phases on a multi-tenant stack, which has no console", () => {
    expect(setupPhases({ ...FACTS, it: null }).map((p) => p.key)).toEqual(["context", "company", "open"]);
  });
});

describe("setupPhases: phase 1, server", () => {
  it("is done with mail and a fresh off-server backup", () => {
    expect(phase({}, "server").status).toBe("done");
  });

  it("waits for the first backup report", () => {
    expect(phase(goLive({ backup: null }), "server").status).toBe("waiting");
  });

  it.each([
    ["not off the server", { at: new Date(NOW.getTime() - HOUR), offbox: false }],
    ["too old", { at: new Date(NOW.getTime() - 27 * HOUR), offbox: true }],
    ["from the future", { at: new Date(NOW.getTime() + HOUR), offbox: true }],
  ])("is a problem when the backup is %s", (_name, backup) => {
    expect(phase(goLive({ backup }), "server").status).toBe("problem");
  });

  it("is someone's turn without a mail relay, and a problem when the relay is down", () => {
    expect(phase(goLive({ mail: "notConfigured" }), "server").status).toBe("yourTurn");
    expect(phase(goLive({ mail: "unreachable" }), "server").status).toBe("problem");
  });

  it("lets the worst line decide", () => {
    expect(phase(goLive({ backup: null, mail: "unreachable" }), "server").status).toBe("problem");
    expect(phase(goLive({ backup: null, mail: "notConfigured" }), "server").status).toBe("yourTurn");
  });

  it("has no link: nothing in the app changes the server", () => {
    expect(phase({}, "server").href).toBeNull();
  });
});

describe("setupPhases: phase 2, sign-in and directory", () => {
  it("is done with Microsoft on and a good sync", () => {
    expect(phase({}, "signIn").status).toBe("done");
  });

  it("is the IT's turn without Microsoft, and leads to the tenant form", () => {
    const p = phase(goLive({ microsoftOn: false }), "signIn");
    expect(p.status).toBe("yourTurn");
    expect(p.href).toBe("/admin/people#microsoft");
  });

  it("waits for the first good run of a sync that is on", () => {
    const f = goLive({ directory: { on: true, lastRunAt: null, lastOkAt: null, lastError: null } });
    const p = phase(f, "signIn");
    expect(p.status).toBe("waiting");
    expect(p.href).toBe("/admin/connectors#directory");
  });

  it("is a problem when the sync failed or went stale", () => {
    const failed = { ...goLive({ directory: { on: true, lastRunAt: NOW, lastOkAt: null, lastError: "refused" } }), ...connectors({ directory: "error" }) };
    expect(phase(failed, "signIn").status).toBe("problem");
    const stale = goLive({ directory: { on: true, lastRunAt: NOW, lastOkAt: new Date(NOW.getTime() - 25 * HOUR), lastError: null } });
    expect(phase(stale, "signIn").status).toBe("problem");
  });

  it("treats a sync that is off as not used, not as open work", () => {
    const p = phase({ ...goLive({ directory: { on: false, lastRunAt: null, lastOkAt: null, lastError: null } }), ...connectors({ directory: "off" }) }, "signIn");
    expect(p.status).toBe("done");
    expect(p.lines.find((l) => l.key === "directory")?.status).toBe("notUsed");
  });

  it("says nobody can open the console only when no Entra role could either", () => {
    const none = { it: { ...IT, admins: 0 } };
    expect(lineKeys(phase({ ...none, ...goLive({ microsoftOn: false }) }, "signIn"))).toContain("admins");
    expect(lineKeys(phase(none, "signIn"))).not.toContain("admins");
  });
});

describe("setupPhases: phase 3, connectors and AI", () => {
  const off = connectors({ m365: "off", jira: "off", ai: "off", teams: "off" });
  const aiOff = goLive({ ai: { choice: "off", dpaSignedAt: null } });

  it("is done when what is on works, and off is a choice", () => {
    expect(phase(connectors({ jira: "off", m365: "off" }), "connectors").status).toBe("done");
  });

  it("asks for a decision while nothing is on", () => {
    const p = phase({ ...off, ...aiOff }, "connectors");
    expect(p.status).toBe("yourTurn");
    expect(lineKeys(p)).toContain("none");
  });

  it("does not take Microsoft 365's precondition for a request", () => {
    const p = phase({ ...connectors({ m365: "needs", jira: "off", ai: "on" }) }, "connectors");
    expect(p.status).toBe("done");
    expect(p.lines.find((l) => l.key === "m365")?.status).toBe("notUsed");
  });

  it("is a problem when Jira failed", () => {
    expect(phase(connectors({ jira: "error" }), "connectors").status).toBe("problem");
  });

  it("wants the agreement, and leads to the page that records it", () => {
    const p = phase(goLive({ ai: { choice: "azure-openai", dpaSignedAt: null } }), "connectors");
    expect(p.status).toBe("yourTurn");
    expect(p.href).toBe("/admin/assistant");
  });

  it("wants a key for a hosted provider, and a real model instead of the test one", () => {
    expect(phase(connectors({ ai: "needs" }), "connectors").status).toBe("yourTurn");
    const mock = { ...connectors({ ai: "off" }), ...goLive({ ai: { choice: "mock", dpaSignedAt: null } }) };
    expect(phase(mock, "connectors").status).toBe("yourTurn");
  });

  it("otherwise leads to the connectors page", () => {
    expect(phase({}, "connectors").href).toBe("/admin/connectors");
  });
});

describe("setupPhases: lines that stand alone", () => {
  // The go-live page's own lines sit under a heading; here each one has to say what it is about.
  const lineOf = (f: Partial<SetupFacts>, key: PhaseKey, line: string) => phase(f, key).lines.find((l) => l.key === line);

  it("names the AI provider in every state", () => {
    expect(lineOf({}, "connectors", "ai")).toMatchObject({ line: "settingsSetupPhases.lineAiOn", values: { date: "2026-10-01T00:00:00.000Z" } });
    expect(lineOf(goLive({ ai: { choice: "azure-openai", dpaSignedAt: null } }), "connectors", "ai")?.line).toBe("settingsSetupPhases.lineAiNoAgreement");
    expect(lineOf({ ...connectors({ ai: "off" }), ...goLive({ ai: { choice: "mock", dpaSignedAt: null } }) }, "connectors", "ai")?.line).toBe("settingsSetupPhases.lineAiMock");
  });

  it("names the directory sync when it is done or failing", () => {
    expect(lineOf({}, "signIn", "directory")).toMatchObject({ line: "settingsSetupPhases.lineDirectoryDone", values: { time: expect.any(String) } });
    const stale = goLive({ directory: { on: true, lastRunAt: NOW, lastOkAt: new Date(NOW.getTime() - 25 * HOUR), lastError: null } });
    expect(lineOf(stale, "signIn", "directory")?.line).toBe("settingsSetupPhases.lineDirectoryProblem");
  });
});

describe("setupPhases: phase 4, company context", () => {
  it.each([
    ["notUsed", "notUsed"],
    ["idle", "yourTurn"],
    ["running", "waiting"],
    ["ready", "done"], // stays ready after the review, so it cannot be someone's turn
    ["failed", "problem"],
  ] as const)("reads the run's %s as %s", (context, status) => {
    expect(phase({ context }, "context").status).toBe(status);
  });

  it("links to the context panel on the company step", () => {
    expect(phase({}, "context").href).toBe("/acme/setup/company#context");
  });
});

describe("setupPhases: phase 5, company to members", () => {
  it("is done once all five steps are", () => {
    const p = phase({}, "company");
    expect(p.status).toBe("done");
    expect(p.href).toBe("/acme/setup/done");
  });

  it("leads to the first step not done and says it is coming back", () => {
    const p = phase({ counts: { named: true, units: 1, seats: 0, routes: 0, members: 1 } }, "company");
    expect(p.status).toBe("yourTurn");
    expect(p.href).toBe("/acme/setup/roles?resume=1");
    expect(p.lines[0].values).toMatchObject({ n: 3, total: 5, stepKey: "settingsSetup.stepRoles" });
  });

  it("has nothing to resume on the first step or after the last", () => {
    expect(resumeHref("/acme", "company")).toBe("/acme/setup/company");
    expect(resumeHref("/acme", "done")).toBe("/acme/setup/done");
    expect(resumeHref("", "units")).toBe("/setup/units?resume=1");
  });
});

describe("setupPhases: phase 6, check and open", () => {
  const closed = { openedAt: null };

  it("is done once opened", () => {
    expect(phase({}, "open").status).toBe("done");
  });

  it("comes last: it waits for the five steps, whatever the checks say", () => {
    const p = phase({ ...closed, counts: { named: false, units: 0, seats: 0, routes: 0, members: 1 } }, "open");
    expect(p.status).toBe("waiting");
    expect(p.lines[0].key).toBe("steps");
  });

  it("is someone's turn when every needed check passes", () => {
    const p = phase(closed, "open");
    expect(p.status).toBe("yourTurn");
    expect(p.lines[0].key).toBe("ready");
    expect(p.href).toBe("/acme/setup/open");
  });

  it("counts the open needed checks, and recommended ones do not count", () => {
    const p = phase({ ...closed, ...goLive({ hasCalendar: false, supportOpenUntil: NOW, notifications: false }) }, "open");
    expect(p.status).toBe("yourTurn");
    expect(p.lines[0]).toMatchObject({ key: "checks", values: { count: 2 } });
  });

  it("waits when only the first backup is missing, but not when something else is too", () => {
    expect(phase({ ...closed, ...goLive({ backup: null }) }, "open").status).toBe("waiting");
    expect(phase({ ...closed, ...goLive({ backup: null, hasCalendar: false }) }, "open").status).toBe("yourTurn");
  });

  it("does not wait for a backup that reported something wrong", () => {
    expect(phase({ ...closed, ...goLive({ backup: { at: NOW, offbox: false } }) }, "open").status).toBe("yourTurn");
  });
});

describe("setupPhases: who may do what", () => {
  const it_ = ["signIn", "connectors"] as const;
  const company = ["context", "company", "open"] as const;

  it("lets someone who is both act on everything", () => {
    for (const p of setupPhases(FACTS)) expect(p.canAct, p.key).toBe(true);
  });

  it("gives a stack admin who is no manager the IT phases, and the rest read-only without a link", () => {
    for (const k of it_) {
      expect(phase({ viewer: "stackAdmin" }, k).canAct).toBe(true);
      expect(phase({ viewer: "stackAdmin" }, k).href).toMatch(/^\/admin\//);
    }
    for (const k of company) {
      expect(phase({ viewer: "stackAdmin" }, k).canAct).toBe(false);
      expect(phase({ viewer: "stackAdmin" }, k).href).toBeNull();
    }
  });

  it("gives a manager who is no stack admin the company phases, and no way into a console they cannot open", () => {
    for (const k of company) {
      expect(phase({ viewer: "manager" }, k).canAct).toBe(true);
      expect(phase({ viewer: "manager" }, k).href).not.toBeNull();
    }
    for (const k of it_) {
      expect(phase({ viewer: "manager" }, k).canAct).toBe(false);
      expect(phase({ viewer: "manager" }, k).href).toBeNull();
    }
  });

  it("lets the console act on nothing, and links only to console pages", () => {
    for (const p of setupPhases({ ...FACTS, viewer: "console" })) {
      expect(p.canAct, p.key).toBe(false);
      if (p.href) expect(p.href, p.key).toMatch(/^\/admin\//);
    }
    expect(phase({ viewer: "console" }, "signIn").href).toBe("/admin/connectors#directory");
    expect(phase({ viewer: "console" }, "company").href).toBeNull();
  });

  it("reports the same status to everyone: it comes from the facts, not from the viewer", () => {
    const f = { ...goLive({ backup: null, microsoftOn: false }), context: "running" as const };
    const statuses = (viewer: SetupFacts["viewer"]) => setupPhases({ ...FACTS, ...f, viewer }).map((p) => p.status);
    expect(statuses("manager")).toEqual(statuses("console"));
    expect(statuses("stackAdmin")).toEqual(statuses("both"));
    expect(statuses("manager")).toEqual(statuses("both"));
  });
});

describe("setupIsWaiting", () => {
  const closed = { openedAt: null };
  const waits = (f: Partial<SetupFacts>) => setupIsWaiting(setupPhases({ ...FACTS, ...f }));

  it("is off when nothing waits", () => {
    expect(waits({})).toBe(false);
  });

  it("is on for a backup, a directory sync and a context run", () => {
    expect(waits(goLive({ backup: null }))).toBe(true);
    expect(waits(goLive({ directory: { on: true, lastRunAt: null, lastOkAt: null, lastError: null } }))).toBe(true);
    expect(waits({ context: "running" })).toBe(true);
  });

  it("is off while Open only waits for people", () => {
    expect(waits({ ...closed, counts: { named: false, units: 0, seats: 0, routes: 0, members: 1 } })).toBe(false);
  });

  it("does not poll a problem or someone's turn", () => {
    expect(waits({ context: "failed" })).toBe(false);
    expect(waits(goLive({ mail: "notConfigured" }))).toBe(false);
  });

  it("does not poll on a multi-tenant stack over a backup it cannot show", () => {
    expect(waits({ ...closed, it: null, ...goLive({ backup: null }) })).toBe(false);
  });
});
