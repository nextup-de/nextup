// The Connections verdicts, as the platform /admin shows them and as a stack reports them to
// admin.sellux.ch. Whatever this says must also fit the health contract, or admin refuses the report.
import { describe, expect, it } from "vitest";
import { HealthCheck, HealthReport, HEALTH_CONTRACT_VERSION, worstTone } from "@nextup/contracts";
import { connectionChecks, type ConnectionFacts } from "@/features/admin/connections";
import { describeEnvironment } from "@/features/admin/environment";

const fine: ConnectionFacts = {
  database: "up",
  automation: "live",
  taskCounts: { done: 3, skipped: 0, pending: 0, failed: 0 },
  taskTotal: 3,
  mail: "up",
  environment: [{ label: "AUTH_SECRET", value: "set", tone: "ok" }],
};

const byId = (f: ConnectionFacts) => Object.fromEntries(connectionChecks(f).map((c) => [c.id, c]));

describe("connectionChecks", () => {
  it("is five verdicts, all ok when everything answers", () => {
    const checks = connectionChecks(fine);
    expect(checks.map((c) => c.id)).toEqual(["database", "automation", "tasks", "mail", "environment"]);
    expect(worstTone(checks.map((c) => c.tone))).toBe("ok");
  });

  it("says why the database is down, and nothing when it is up", () => {
    expect(byId({ ...fine, database: "down", databaseHeadline: "Nothing answers at db:5432" }).database).toMatchObject({
      value: "down",
      tone: "bad",
      detail: "Nothing answers at db:5432",
    });
    expect(byId({ ...fine, databaseHeadline: "Answering in 3 ms" }).database.detail).toBeUndefined();
  });

  it("calls stuck notices bad and sending ones a warning", () => {
    expect(byId({ ...fine, taskCounts: { done: 0, skipped: 0, pending: 0, failed: 2 } }).tasks).toMatchObject({ value: "2 stuck", tone: "bad" });
    expect(byId({ ...fine, taskCounts: { done: 0, skipped: 0, pending: 1, failed: 0 } }).tasks.tone).toBe("warn");
  });

  it("treats unset mail as a warning, a dead relay as bad", () => {
    expect(byId({ ...fine, mail: "off" }).mail.tone).toBe("warn");
    expect(byId({ ...fine, mail: "down" }).mail.tone).toBe("bad");
  });

  it("fits the health contract, with a real environment and no secret values", () => {
    const env = { AUTH_SECRET: "a-very-long-secret-value-123456", ADMIN_ACCESS_CODE: "another-long-code-7890", TENANT_MODE: "single", COMPANY_SLUG: "acme", APP_ORIGIN: "https://acme.sellux.ch" };
    const environment = describeEnvironment(env);
    const checks = connectionChecks({ ...fine, environment });
    for (const c of checks) expect(HealthCheck.safeParse(c).success).toBe(true);
    const report = {
      contractVersion: HEALTH_CONTRACT_VERSION,
      companySlug: "acme",
      reportedAt: new Date().toISOString(),
      appCommit: null,
      checks,
      environment,
    };
    expect(HealthReport.safeParse(report).success).toBe(true);
    const sent = JSON.stringify(report);
    expect(sent).not.toContain(env.AUTH_SECRET);
    expect(sent).not.toContain(env.ADMIN_ACCESS_CODE);
  });
});
