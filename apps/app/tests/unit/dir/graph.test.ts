import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { graphDirectory } from "@/server/directory/graph";

const TENANT = "11111111-2222-4333-8444-555555555555";
const APP = { clientId: "client-id", clientSecret: "client-secret" };
const dir = join(__dirname, "../../fixtures/graph-directory");
const load = (f: string): unknown => JSON.parse(readFileSync(join(dir, f), "utf8"));

const NEXT = "https://graph.microsoft.com/v1.0/users/delta?$skiptoken=fixtureSkipToken1";
const DELTA1 = "https://graph.microsoft.com/v1.0/users/delta?$deltatoken=fixtureDeltaToken1";

type Call = { url: string; init?: RequestInit };

function serve(): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const pages: Record<string, string> = { [NEXT]: "full-2.json", [DELTA1]: "delta.json" };
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const file = url.includes("/oauth2/v2.0/token") ? "token.json" : (pages[url] ?? "full-1.json");
    return new Response(JSON.stringify(load(file)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetch: f, calls };
}

describe("DIR Graph directory", () => {
  it("gets an app-only token with client credentials from the tenant's token URL", async () => {
    const s = serve();
    await graphDirectory({ tenantId: TENANT, app: APP, fetch: s.fetch }).delta({ companyId: "c", cursor: null });
    const t = s.calls[0];
    expect(t.url).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`);
    expect(t.init?.method).toBe("POST");
    const body = new URLSearchParams(String(t.init?.body));
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("scope")).toBe("https://graph.microsoft.com/.default");
    expect(body.get("client_id")).toBe("client-id");
  });

  it("pages through a full round and exposes the deltaLink", async () => {
    const s = serve();
    const src = graphDirectory({ tenantId: TENANT, app: APP, fetch: s.fetch });
    expect(src.info.kind).toBe("DirectorySource");

    const p1 = await src.delta({ companyId: "c", cursor: null });
    const u = new URL(s.calls[1].url);
    expect(u.origin + u.pathname).toBe("https://graph.microsoft.com/v1.0/users/delta");
    expect(u.searchParams.get("$select")).toBe(
      "id,displayName,mail,userPrincipalName,department,jobTitle,employeeId,accountEnabled",
    );
    expect(u.searchParams.get("$expand")).toBe("manager($select=id)");
    expect(new Headers(s.calls[1].init?.headers).get("authorization")).toBe("Bearer fixture-access-token-not-a-real-token");
    expect(p1.nextCursor).toBe(NEXT);
    expect(src.deltaLink()).toBeNull();

    const p2 = await src.delta({ companyId: "c", cursor: p1.nextCursor });
    expect(p2.nextCursor).toBeNull();
    expect(src.deltaLink()).toBe(DELTA1);

    const all = [...p1.entries, ...p2.entries];
    expect(all).toHaveLength(5);
    const by = (n: string) => all.find((e) => e.displayName === n)!;
    expect(by("Mira Example")).toMatchObject({
      externalId: "a0000000-0000-4000-8000-000000000001",
      email: "mira.example@contoso-fixture.example",
      department: "Engineering",
      jobTitle: "Head of Engineering",
      employeeId: "P-10001",
      managerExternalId: null,
      active: true,
    });
    expect(by("Noel Sample").managerExternalId).toBe("a0000000-0000-4000-8000-000000000001");
    expect(by("Olga Placeholder").email).toBe("olga.placeholder@contoso-fixture.onmicrosoft.com");
    expect(by("Quin Disabled").active).toBe(false);
  });

  it("reads a delta round: moved, removed and new users", async () => {
    const s = serve();
    const src = graphDirectory({ tenantId: TENANT, app: APP, fetch: s.fetch });
    const p = await src.delta({ companyId: "c", cursor: DELTA1 });
    expect(s.calls[1].url).toBe(DELTA1);
    expect(p.removedExternalIds).toEqual(["a0000000-0000-4000-8000-000000000003"]);
    expect(p.entries.map((e) => e.displayName)).toEqual(["Pia Demo", "Rune Newhire"]);
    expect(p.entries[0]).toMatchObject({ department: "Engineering", managerExternalId: "a0000000-0000-4000-8000-000000000001" });
    expect(p.entries[1].employeeId).toBe("P-10006");
    expect(p.nextCursor).toBeNull();
    expect(src.deltaLink()).toBe("https://graph.microsoft.com/v1.0/users/delta?$deltatoken=fixtureDeltaToken2");
  });

  it("refuses a cursor outside graph.microsoft.com without a fetch", async () => {
    const s = serve();
    const src = graphDirectory({ tenantId: TENANT, app: APP, fetch: s.fetch });
    await expect(src.delta({ companyId: "c", cursor: "https://evil.example/v1.0/users/delta" })).rejects.toThrow(/refused/);
    expect(s.calls).toHaveLength(0);
  });

  it("fetches the token once for two calls", async () => {
    const s = serve();
    const src = graphDirectory({ tenantId: TENANT, app: APP, fetch: s.fetch });
    await src.delta({ companyId: "c", cursor: null });
    await src.delta({ companyId: "c", cursor: NEXT });
    expect(s.calls.filter((c) => c.url.includes("/oauth2/v2.0/token"))).toHaveLength(1);
  });

  it("throws status and Graph error code only", async () => {
    const f = (async () =>
      new Response(JSON.stringify({ error: { code: "Authorization_RequestDenied", message: "secret detail" } }), {
        status: 403,
      })) as typeof fetch;
    const err = await graphDirectory({ tenantId: TENANT, app: APP, fetch: f })
      .delta({ companyId: "c", cursor: null })
      .catch((e: Error) => e);
    expect((err as Error).message).toBe("Graph token request failed: 403 Authorization_RequestDenied");
  });
});
