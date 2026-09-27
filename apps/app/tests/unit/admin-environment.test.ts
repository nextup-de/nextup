// /admin/connections shows how the server is configured - and must never show a secret's value.
import { describe, expect, it } from "vitest";
import { describeEnvironment } from "@/features/admin/environment";

const good = {
  AUTH_SECRET: "a-long-enough-random-secret-value",
  ADMIN_ACCESS_CODE: "another-long-enough-random-code",
  TENANT_MODE: "path",
  APP_DOMAIN: "localhost:3000",
};

const row = (env: Record<string, string>, label: string) => describeEnvironment(env).find((r) => r.label === label);

describe("describeEnvironment", () => {
  it("is all green for a sane setup", () => {
    expect(describeEnvironment(good).filter((r) => r.tone !== "ok")).toEqual([]);
  });

  it("flags a missing secret and the .env.example placeholder", () => {
    expect(row({ ...good, AUTH_SECRET: "" }, "AUTH_SECRET")?.tone).toBe("bad");
    expect(row({ ...good, ADMIN_ACCESS_CODE: "change-me" }, "ADMIN_ACCESS_CODE")?.tone).toBe("bad");
    expect(row({ ...good, ADMIN_ACCESS_CODE: "short" }, "ADMIN_ACCESS_CODE")?.tone).toBe("warn");
  });

  it("never prints a secret", () => {
    const text = JSON.stringify(describeEnvironment(good));
    expect(text).not.toContain(good.AUTH_SECRET);
    expect(text).not.toContain(good.ADMIN_ACCESS_CODE);
  });

  it("warns about demo shortcuts; https turns secure cookies on by itself", () => {
    expect(row({ ...good, LOGIN_DEMO_FILL: "true" }, "Login demo fill")?.tone).toBe("warn");
    expect(row({ ...good, ADMIN_DEMO_FILL: "true" }, "Admin demo fill")?.tone).toBe("warn");
    // secureCookies() in src/server/issue-session.ts: PUBLIC_SCHEME=https is enough.
    expect(row({ ...good, PUBLIC_SCHEME: "https" }, "Secure cookies")?.value).toMatch(/^on/);
    expect(row({ ...good, PUBLIC_SCHEME: "https", COOKIE_SECURE: "true" }, "Secure cookies")?.tone).toBe("ok");
  });
});
