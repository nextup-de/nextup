import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { teamsApp, type TeamsApp } from "@/features/teams/config";
import { resetBotKeyCache, verifyBotRequest } from "@/server/teams/auth";
import { startFakeBotFramework, type FakeBotFramework } from "../../fake-botframework/fake-botframework";

describe("TMS bot token check", () => {
  let fake: FakeBotFramework;
  let app: TeamsApp;
  let activity: { serviceUrl: string };
  const bearer = (jwt: string) => `Bearer ${jwt}`;
  const now = () => Math.floor(Date.now() / 1000);

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
    activity = { serviceUrl: fake.serviceUrl };
  });
  afterAll(() => fake.close());
  beforeEach(() => {
    resetBotKeyCache();
    fake.counts.jwks = 0;
  });

  it("accepts a token minted by the fake", async () => {
    expect(await verifyBotRequest(bearer(fake.mintToken()), activity, app)).toEqual({ ok: true });
  });

  it("refuses a missing or malformed header", async () => {
    expect(await verifyBotRequest(undefined, activity, app)).toEqual({ ok: false, reason: "missing" });
    expect(await verifyBotRequest("", activity, app)).toEqual({ ok: false, reason: "missing" });
    expect((await verifyBotRequest(fake.mintToken(), activity, app)).ok).toBe(false);
  });

  it("refuses another signing key", async () => {
    expect((await verifyBotRequest(bearer(fake.mintWithOtherKey()), activity, app)).ok).toBe(false);
  });

  it("refuses a wrong issuer, a wrong audience and an expired token", async () => {
    expect(await verifyBotRequest(bearer(fake.mintToken({ iss: "https://evil.example" })), activity, app)).toEqual({ ok: false, reason: "issuer" });
    expect(await verifyBotRequest(bearer(fake.mintToken({ aud: "other-app" })), activity, app)).toEqual({ ok: false, reason: "audience" });
    expect(await verifyBotRequest(bearer(fake.mintToken({ exp: now() - 3600 })), activity, app)).toEqual({ ok: false, reason: "expired" });
    expect(await verifyBotRequest(bearer(fake.mintToken({ nbf: now() + 3600 })), activity, app)).toEqual({ ok: false, reason: "expired" });
  });

  it("tolerates five minutes of clock skew", async () => {
    expect(await verifyBotRequest(bearer(fake.mintToken({ exp: now() - 120 })), activity, app)).toEqual({ ok: true });
  });

  it("refuses an HS256 or none token", async () => {
    expect((await verifyBotRequest(bearer(fake.mintWithAlg("HS256")), activity, app)).ok).toBe(false);
    expect((await verifyBotRequest(bearer(fake.mintWithAlg("none")), activity, app)).ok).toBe(false);
  });

  it("refuses a serviceUrl that differs from the activity's", async () => {
    const r = await verifyBotRequest(bearer(fake.mintToken()), { serviceUrl: "https://elsewhere.example/" }, app);
    expect(r).toEqual({ ok: false, reason: "serviceurl" });
    expect((await verifyBotRequest(bearer(fake.mintToken({ serviceurl: undefined })), activity, app)).ok).toBe(false);
    expect((await verifyBotRequest(bearer(fake.mintToken()), {}, app)).ok).toBe(false);
  });

  it("fetches the keys once and reuses them", async () => {
    await verifyBotRequest(bearer(fake.mintToken()), activity, app);
    await verifyBotRequest(bearer(fake.mintToken()), activity, app);
    expect(fake.counts.jwks).toBe(1);
  });

  it("refetches exactly once for an unknown kid", async () => {
    await verifyBotRequest(bearer(fake.mintToken()), activity, app); // primes the cache: 1 fetch
    expect(fake.counts.jwks).toBe(1);
    const r = await verifyBotRequest(bearer(fake.mintWithOtherKey()), activity, app);
    expect(r.ok).toBe(false);
    expect(fake.counts.jwks).toBe(2);
  });
});
