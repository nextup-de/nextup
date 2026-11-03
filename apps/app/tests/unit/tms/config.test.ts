import { describe, expect, it } from "vitest";
import { teamsApp, TEAMS_SYSTEM } from "@/features/teams/config";

const set = { TEAMS_APP_ID: "app-1", TEAMS_APP_PASSWORD: "pw", TEAMS_TENANT_ID: "tenant-1" };

describe("TMS config", () => {
  it("returns the app with the default OpenID and token URLs", () => {
    expect(teamsApp(set)).toEqual({
      appId: "app-1",
      password: "pw",
      tenantId: "tenant-1",
      openIdUrl: "https://login.botframework.com/v1/.well-known/openidconfiguration",
      tokenUrl: "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token",
    });
  });

  it("returns null unless all three are set", () => {
    expect(teamsApp({})).toBeNull();
    for (const k of Object.keys(set)) expect(teamsApp({ ...set, [k]: undefined }), k).toBeNull();
    expect(teamsApp({ ...set, TEAMS_APP_PASSWORD: "  " })).toBeNull();
  });

  it("takes the test overrides for the URLs", () => {
    const app = teamsApp({ ...set, TEAMS_OPENID_URL: "http://127.0.0.1:1/openid", TEAMS_TOKEN_URL: "http://127.0.0.1:1/token" });
    expect(app?.openIdUrl).toBe("http://127.0.0.1:1/openid");
    expect(app?.tokenUrl).toBe("http://127.0.0.1:1/token");
  });

  it("names the integration system teams", () => {
    expect(TEAMS_SYSTEM).toBe("teams");
  });
});
