import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { teamsApp, type TeamsApp } from "@/features/teams/config";
import { appToken, resetAppToken, retryableStatus, sendActivity } from "@/server/teams/connector";
import { startFakeBotFramework, type FakeBotFramework } from "../../fake-botframework/fake-botframework";

describe("TMS connector", () => {
  let fake: FakeBotFramework;
  let app: TeamsApp;
  const T0 = 1_800_000_000_000;

  beforeAll(async () => {
    fake = await startFakeBotFramework();
    const made = teamsApp({
      TEAMS_APP_ID: fake.appId,
      TEAMS_APP_PASSWORD: fake.password,
      TEAMS_TENANT_ID: "tenant-1",
      TEAMS_OPENID_URL: fake.openIdUrl,
      TEAMS_TOKEN_URL: fake.tokenUrl,
    });
    if (!made) throw new Error("app not configured");
    app = made;
  });
  afterAll(() => fake.close());
  beforeEach(() => {
    resetAppToken();
    fake.counts.token = 0;
    fake.activities.length = 0;
  });

  it("gets one app token by client credentials and reuses it until shortly before expiry", async () => {
    const a = await appToken(app, T0);
    expect(await appToken(app, T0 + 50 * 60_000)).toBe(a);
    expect(fake.counts.token).toBe(1);
    const b = await appToken(app, T0 + 56 * 60_000); // inside the last five minutes of the hour
    expect(b).not.toBe(a);
    expect(fake.counts.token).toBe(2);
  });

  it("fails when the secret is wrong", async () => {
    await expect(appToken({ ...app, password: "wrong" }, T0)).rejects.toThrow(/401/);
  });

  it("posts an activity to the conversation and returns its id", async () => {
    const activity = { type: "message", text: "hello" };
    const r = await sendActivity(app, fake.serviceUrl, "conv-1", activity, T0);
    expect(r.status).toBe(200);
    expect(r.id).toMatch(/^fake-activity-/);
    expect(fake.activities).toHaveLength(1);
    expect(fake.activities[0]).toMatchObject({ conversationId: "conv-1", activity });
    expect(fake.activities[0].authorization).toMatch(/^Bearer fake-app-token-/);
    expect(fake.counts.token).toBe(1);
  });

  it("returns the failure status with no id", async () => {
    fake.failNext(429);
    expect(await sendActivity(app, fake.serviceUrl, "conv-1", {}, T0)).toEqual({ status: 429, id: null });
    fake.failNext(404);
    expect(await sendActivity(app, fake.serviceUrl, "conv-1", {}, T0)).toEqual({ status: 404, id: null });
  });

  it("reports 429 and 5xx as retryable and 401, 403 and 404 as not", () => {
    for (const s of [429, 500, 502, 503]) expect(retryableStatus(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 410]) expect(retryableStatus(s)).toBe(false);
    expect(retryableStatus(200)).toBe(false);
  });
});
