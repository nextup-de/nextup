import { describe, expect, it } from "vitest";
import { successFactorsClient } from "@/server/directory/successfactors/client";
import { fakeSuccessFactors } from "../../fixtures/successfactors/fake-fetch";
import { makeTestKeys } from "../../fixtures/successfactors/keys";

const HOST = "https://api4.example.test";
const settings = { apiHost: HOST, companyId: "Musterwerk", clientId: "client-abc", apiUserId: "NEXTUP_API" };
const FIRST = `${HOST}/odata/v2/User?$select=userId,email&$format=json&$top=500`;
const SECOND = `${HOST}/odata/v2/User?$skiptoken=2`;

describe("SFX OData client", () => {
  const keys = makeTestKeys();

  function setup(pages: Record<string, unknown>, extra: { now?: () => Date; expiresIn?: number } = {}) {
    const sf = fakeSuccessFactors({ pages, cert: keys.certPem, expiresIn: extra.expiresIn });
    const waits: number[] = [];
    const client = successFactorsClient({
      settings,
      privateKeyPem: keys.privateKeyPem,
      fetch: sf.fetch,
      now: extra.now,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    return { sf, client, waits };
  }

  const get = (c: ReturnType<typeof setup>["client"]) => c.get("User", { select: ["userId", "email"] });

  it("gets one token with a verified assertion and reuses it", async () => {
    const { sf, client } = setup({ [FIRST]: { d: { results: [{ userId: "u1" }] } } });
    expect(await get(client)).toEqual([{ userId: "u1" }]);
    await get(client);
    const tokens = sf.requests.filter((r) => r.url.endsWith("/oauth/token"));
    expect(tokens).toHaveLength(1);
    const form = new URLSearchParams(tokens[0].body ?? "");
    expect(form.get("company_id")).toBe("Musterwerk");
    expect(form.get("new_token")).toBe("true");
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:saml2-bearer");
    expect(sf.requests.at(-1)?.authorization).toBe("Bearer token-1");
  });

  it("asks for a new token five minutes before the old one expires", async () => {
    let t = Date.parse("2026-11-03T10:00:00Z");
    const { sf, client } = setup({ [FIRST]: { d: { results: [] } } }, { now: () => new Date(t), expiresIn: 3600 });
    await get(client);
    t += 54 * 60_000;
    await get(client);
    expect(sf.requests.filter((r) => r.url.endsWith("/oauth/token"))).toHaveLength(1);
    t += 2 * 60_000;
    await get(client);
    expect(sf.requests.filter((r) => r.url.endsWith("/oauth/token"))).toHaveLength(2);
  });

  it("follows __next on the configured host and collects all pages", async () => {
    const { client } = setup({
      [FIRST]: { d: { results: [{ userId: "u1" }], __next: SECOND } },
      [SECOND]: { d: { results: [{ userId: "u2" }] } },
    });
    expect(await get(client)).toEqual([{ userId: "u1" }, { userId: "u2" }]);
  });

  it("refuses __next on another host and does not call it", async () => {
    const evil = "https://evil.example.test/odata/v2/User?$skiptoken=2";
    const { sf, client } = setup({ [FIRST]: { d: { results: [], __next: evil } }, [evil]: { d: { results: [] } } });
    await expect(get(client)).rejects.toThrow(/not on the configured API host/);
    expect(sf.requests.some((r) => r.url.startsWith("https://evil"))).toBe(false);
  });

  it("refuses a request without $select, with unknown entities or odd field names", async () => {
    const { sf, client } = setup({});
    await expect(client.get("User", { select: [] })).rejects.toThrow(/\$select is required/);
    await expect(client.get("User", { select: ["a b"] })).rejects.toThrow(/\$select/);
    await expect(client.get("EmpTime", { select: ["x"] })).rejects.toThrow(/entity not allowed/);
    expect(sf.requests).toHaveLength(0);
  });

  it("sends filter and asOfDate", async () => {
    const url = `${HOST}/odata/v2/EmpJob?$select=userId&$format=json&$top=500&$filter=userId eq 'a'&asOfDate=2026-11-03`;
    const { client } = setup({ [url]: { d: { results: [{ userId: "a" }] } } });
    expect(await client.get("EmpJob", { select: ["userId"], filter: "userId eq 'a'", asOfDate: "2026-11-03" })).toHaveLength(1);
  });

  it("retries a 429 twice after Retry-After, then succeeds", async () => {
    const { sf, client, waits } = setup({ [FIRST]: { d: { results: [{ userId: "u1" }] } } });
    sf.throttle(2, "3");
    expect(await get(client)).toEqual([{ userId: "u1" }]);
    expect(waits).toEqual([3000, 3000]);
  });

  it("gives up after two retries and caps the wait at 30 seconds", async () => {
    const { sf, client, waits } = setup({ [FIRST]: { d: { results: [] } } });
    sf.throttle(3, "600");
    await expect(get(client)).rejects.toThrow("SuccessFactors request failed: 429");
    expect(waits).toEqual([30_000, 30_000]);
  });

  it("errors carry no body, token, key or assertion", async () => {
    const sf = fakeSuccessFactors({ pages: {}, cert: makeTestKeys("other").certPem });
    const client = successFactorsClient({ settings, privateKeyPem: keys.privateKeyPem, fetch: sf.fetch });
    const err = await get(client).then(
      () => null,
      (e: Error) => e,
    );
    expect(err?.message).toBe("SuccessFactors token request failed: 400");
    const text = String(err?.message) + String(err?.stack);
    expect(text).not.toContain("invalid_grant");
    expect(text).not.toContain("BEGIN");
    expect(text).not.toContain(Buffer.from("saml2:Assertion").toString("base64").slice(0, 12));

    const ok = setup({ [FIRST]: { d: { results: [] } } });
    const missing = await ok.client.get("User", { select: ["userId"] }).then(
      () => null,
      (e: Error) => e,
    );
    expect(missing?.message).toBe("SuccessFactors request failed: 404");
    expect(missing?.message).not.toContain("not found");
    expect(missing?.message).not.toContain("token-1");
  });

  it("does not leak the key when it is unusable", async () => {
    const sf = fakeSuccessFactors({ pages: {}, cert: keys.certPem });
    const client = successFactorsClient({ settings, privateKeyPem: "secretbits", fetch: sf.fetch });
    await expect(client.token()).rejects.toThrow(/^SuccessFactors assertion signing failed$/);
  });
});
