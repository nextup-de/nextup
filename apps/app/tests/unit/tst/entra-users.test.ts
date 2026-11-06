// TST: the people export of the Musterwerk generator and ops/tst/entra-users.ts, which writes those people to
// the Entra test tenant. Every Graph call here goes to a faked fetch; nothing leaves the machine.
import { describe, expect, it } from "vitest";
import { musterwerkCrew, peopleExport } from "../../../prisma/generators/musterwerk/export";
import {
  GRAPH, MARK, assertTenantDomain, createBody, deletable, deleteUsers, graph, isOurs, main, managerRef, parseArgs, randomPassword,
  readExport, syncUsers, updateBody, wantedUsers, type Deps, type ExportPerson,
} from "../../../../../ops/tst/entra-users";

const DOMAIN = "nextuptest.example";
// Put together at run time: a key-shaped literal would trip the secret scan.
const TOKEN = ["fake", "graph", "bearer"].join("-");

describe("Musterwerk people export", () => {
  const plain = musterwerkCrew({ slug: "mw", people: 150, seed: 7 });
  const moved = musterwerkCrew({ slug: "mw", people: 150, seed: 7, emailDomain: DOMAIN });

  it("gives the same people under another email domain", () => {
    const local = (email: string) => email.split("@")[0];
    expect(moved.people.users.map((u) => ({ ...u, email: local(u.email) }))).toEqual(plain.people.users.map((u) => ({ ...u, email: local(u.email) })));
    expect(plain.people.users.every((u) => u.email.endsWith("@musterwerk.test"))).toBe(true);
    expect(moved.people.users.every((u) => u.email.endsWith(`@${DOMAIN}`))).toBe(true);
    expect(moved.people.codes.map((c) => c.code)).toEqual(plain.people.codes.map((c) => c.code));
    expect(moved.knowledge).toEqual(plain.knowledge);
  });

  it("exports name, email, the unit key, the title, the manager's email and the enabled state", () => {
    const out = peopleExport(moved.people.users, DOMAIN);
    expect(out.emailDomain).toBe(DOMAIN);
    expect(out.people).toHaveLength(150);
    expect(Object.keys(out.people[0]).sort()).toEqual(["department", "email", "enabled", "jobTitle", "managerEmail", "name"]);
    const unitKeys = new Set(moved.knowledge.units.map((u) => u.key));
    const seen = new Set<string>();
    for (const p of out.people) {
      expect(unitKeys.has(p.department)).toBe(true);
      expect(p.enabled).toBe(true);
      // A manager stands before the people who report to them.
      if (p.managerEmail) expect(seen.has(p.managerEmail)).toBe(true);
      seen.add(p.email);
      // Entra's limits: 64 for the name before the @ and the department, 128 for the title.
      expect(p.email.split("@")[0].length).toBeLessThanOrEqual(64);
      expect(p.email).toMatch(/^[a-z0-9.]+@nextuptest\.example$/);
      expect(p.jobTitle.length).toBeLessThanOrEqual(128);
    }
    expect(seen.size).toBe(150);
    expect(out.people.filter((p) => p.managerEmail === null)).toHaveLength(1);
  });

  it("refuses an email domain that is not a host name", () => {
    expect(() => musterwerkCrew({ slug: "mw", people: 150, seed: 7, emailDomain: "Not A Domain" })).toThrow(/email domain/);
  });
});

const people: ExportPerson[] = [
  { name: "Kofi Silva", email: `kofi.silva0@${DOMAIN}`, department: "zentrale", jobTitle: "Geschäftsführer", managerEmail: null, enabled: true },
  { name: "Ute Braun", email: `ute.braun1@${DOMAIN}`, department: "nord-production", jobTitle: "Leiter Produktion", managerEmail: `kofi.silva0@${DOMAIN}`, enabled: true },
  { name: "Ali Kaya", email: `ali.kaya2@${DOMAIN}`, department: "nord-assembly", jobTitle: "Mitarbeiter · Montage", managerEmail: `ute.braun1@${DOMAIN}`, enabled: true },
];

type Call = { method: string; url: string; body: unknown; auth: string | null };
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

/** A tenant in memory: `answer` sees every call and says what Graph says. */
function fake(answer: (call: Call, n: number) => Reply) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const lines: string[] = [];
  const deps: Deps = {
    token: TOKEN,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET", url: String(input),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
        auth: new Headers(init?.headers).get("authorization"),
      };
      calls.push(call);
      const r = answer(call, calls.length);
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers });
    }) as typeof fetch,
    sleep: async (ms) => { sleeps.push(ms); },
    log: (line) => { lines.push(line); },
  };
  return { deps, calls, sleeps, lines };
}

const orgs = (...names: string[]): Reply => ({ status: 200, body: { value: [{ verifiedDomains: names.map((name) => ({ name })) }] } });
const isList = (c: Call) => c.method === "GET" && c.url.startsWith(`${GRAPH}users?`);

describe("ops/tst/entra-users.ts", () => {
  it("reads its options and refuses what it does not know", () => {
    const o = parseArgs(["--people", "p.json", "--email-domain", "NextUpTest.Example", "--extra-joiners", "20", "--leavers", "1", "--limit", "2", "--dry-run"]);
    expect(o).toMatchObject({ peopleFile: "p.json", emailDomain: DOMAIN, extraJoiners: 20, leavers: 1, limit: 2, dryRun: true, remove: false });
    expect(() => parseArgs(["--people", "p.json"])).toThrow(/--email-domain/);
    expect(() => parseArgs(["--email-domain", DOMAIN])).toThrow(/--people/);
    expect(() => parseArgs(["--people", "p.json", "--email-domain", DOMAIN, "--purge"])).toThrow(/unknown option/);
    expect(() => parseArgs(["--delete", "--email-domain", DOMAIN, "--people", "p.json"])).toThrow(/--delete goes with/);
    expect(parseArgs(["--delete", "--email-domain", DOMAIN])).toMatchObject({ remove: true, limit: null });
  });

  it("refuses an export made for another domain", () => {
    const json = JSON.stringify({ emailDomain: "musterwerk.test", people: [{ ...people[0], email: "kofi.silva0@musterwerk.test" }] });
    expect(() => readExport(json, DOMAIN)).toThrow(/is not in nextuptest\.example/);
    expect(readExport(JSON.stringify({ people }), DOMAIN)).toEqual(people);
  });

  it("plans the export people first, then joiners in a member's unit, then switched-off leavers", () => {
    const all = wantedUsers(people, { emailDomain: DOMAIN, extraJoiners: 20, leavers: 1, limit: null });
    expect(all).toHaveLength(24);
    expect(all[1]).toEqual({
      upn: `ute.braun1@${DOMAIN}`, mailNickname: "ute.braun1", displayName: "Ute Braun", department: "nord-production",
      jobTitle: "Leiter Produktion", accountEnabled: true, employeeId: "NXTST-P0002", managerUpn: `kofi.silva0@${DOMAIN}`,
    });
    const joiners = all.slice(3, 23);
    expect(new Set(joiners.map((j) => j.upn)).size).toBe(20);
    expect(new Set(joiners.map((j) => j.displayName)).size).toBe(20);
    for (const j of joiners) {
      expect(j).toMatchObject({ department: "nord-assembly", managerUpn: `ute.braun1@${DOMAIN}`, accountEnabled: true });
      expect(j.employeeId).toMatch(/^NXTST-J\d{4}$/);
      expect(j.upn).toMatch(/^[a-z]+\.[a-z]+\.neu\d+@nextuptest\.example$/);
      expect(people.some((p) => p.email === j.upn)).toBe(false);
    }
    expect(all[23]).toMatchObject({ accountEnabled: false, employeeId: "NXTST-L0001" });
    expect(new Set(all.map((w) => w.employeeId)).size).toBe(24);
    expect(all.every((w) => w.employeeId.length <= 16 && isOurs(w))).toBe(true);
    expect(wantedUsers(people, { emailDomain: DOMAIN, extraJoiners: 20, leavers: 1, limit: 2 }).map((w) => w.upn)).toEqual([people[0].email, people[1].email]);
  });

  it("builds the create, update and manager requests", () => {
    const [, ute] = wantedUsers(people, { emailDomain: DOMAIN, extraJoiners: 0, leavers: 0, limit: null });
    expect(createBody(ute, "pw-1")).toEqual({
      accountEnabled: true, displayName: "Ute Braun", mailNickname: "ute.braun1", userPrincipalName: `ute.braun1@${DOMAIN}`,
      department: "nord-production", jobTitle: "Leiter Produktion", employeeId: "NXTST-P0002",
      passwordProfile: { forceChangePasswordNextSignIn: false, password: "pw-1" },
    });
    const same = { displayName: "Ute Braun", department: "nord-production", jobTitle: "Leiter Produktion", employeeId: "NXTST-P0002", accountEnabled: true };
    expect(updateBody(same, ute)).toEqual({});
    expect(updateBody({ ...same, department: "Produktion", accountEnabled: false }, ute)).toEqual({ department: "nord-production", accountEnabled: true });
    expect(managerRef("id-9")).toEqual({ "@odata.id": "https://graph.microsoft.com/v1.0/users/id-9" });
    const a = randomPassword();
    expect(a).not.toBe(randomPassword());
    expect(a.length).toBeGreaterThanOrEqual(24);
  });

  it("knows its own users by the mark alone", () => {
    expect(MARK).toBe("NXTST-");
    expect(isOurs({ employeeId: "NXTST-P0001" })).toBe(true);
    expect(isOurs({ employeeId: "4711" })).toBe(false);
    expect(isOurs({ employeeId: null })).toBe(false);
    expect(isOurs({})).toBe(false);
    expect(isOurs(null)).toBe(false);
  });

  it("stops before any write when the domain is not one of the tenant's", async () => {
    const t = fake(() => orgs("contoso.onmicrosoft.com", "contoso.com"));
    await expect(assertTenantDomain(t.deps, DOMAIN)).rejects.toThrow(/not a verified domain/);
    await expect(main(["--delete", "--email-domain", DOMAIN], { GRAPH_TOKEN: TOKEN }, t.deps)).rejects.toThrow(/Nothing was changed/);
    expect(t.calls.every((c) => c.method === "GET" && c.url.startsWith(`${GRAPH}organization`))).toBe(true);
    const mine = fake(() => orgs("NextUpTest.Example"));
    await expect(assertTenantDomain(mine.deps, DOMAIN)).resolves.toBeUndefined();
  });

  it("waits for Retry-After on 429 and tries again", async () => {
    const t = fake((_c, n) => (n === 1 ? { status: 429, headers: { "retry-after": "7" } } : { status: 201, body: { id: "u1" } }));
    const a = await graph(t.deps, "POST", "users", { x: 1 });
    expect(a).toEqual({ status: 201, body: { id: "u1" } });
    expect(t.sleeps).toEqual([7000]);
    expect(t.calls).toHaveLength(2);
    expect(t.calls[1]).toMatchObject({ method: "POST", url: `${GRAPH}users`, body: { x: 1 }, auth: `Bearer ${TOKEN}` });
    // Without the header it still waits, and it gives up after six tries.
    const busy = fake(() => ({ status: 429 }));
    expect((await graph(busy.deps, "GET", "users/x")).status).toBe(429);
    expect(busy.calls).toHaveLength(6);
    expect(busy.sleeps).toEqual([5000, 10000, 15000, 20000, 25000]);
    await expect(graph(t.deps, "GET", "https://example.com/v1.0/users")).rejects.toThrow(/refused/);
  });

  it("creates the missing, updates its own, leaves a foreign account alone, then sets the managers", async () => {
    const wanted = wantedUsers(people, { emailDomain: DOMAIN, extraJoiners: 0, leavers: 0, limit: null });
    const t = fake((c) => {
      if (isList(c)) {
        return { status: 200, body: { value: [
          { id: "id-kofi", userPrincipalName: `Kofi.Silva0@${DOMAIN}`, displayName: "Kofi Silva", department: "old", jobTitle: "Geschäftsführer", accountEnabled: true, employeeId: "NXTST-P0001" },
          // The filter is checked again on our side: a user without the mark never counts as ours.
          { id: "id-stranger", userPrincipalName: `ute.braun1@${DOMAIN}`, employeeId: "4711" },
        ] } };
      }
      if (c.method === "POST") {
        const upn = (c.body as { userPrincipalName: string }).userPrincipalName;
        if (upn.startsWith("ute.")) return { status: 400, body: { error: { code: "Request_BadRequest", message: "Another object with the same value for property userPrincipalName already exists." } } };
        return { status: 201, body: { id: "id-ali" } };
      }
      if (c.method === "GET") return { status: 200, body: { id: "id-stranger", userPrincipalName: `ute.braun1@${DOMAIN}`, employeeId: "4711" } };
      return { status: 204 };
    });
    const sum = await syncUsers(t.deps, wanted, { signIn: `ali.kaya2@${DOMAIN}`, signInPassword: "chosen-by-kevin-1" });
    // Ali's manager is the foreign account, which this run has no id for: his manager is not set.
    expect(sum).toEqual({ created: 1, updated: 1, unchanged: 0, foreign: 1, failed: 0, managersSet: 0, managersSkipped: 1 });
    const writes = t.calls.filter((c) => c.method !== "GET");
    expect(writes.map((c) => `${c.method} ${c.url.slice(GRAPH.length)}`)).toEqual(["PATCH users/id-kofi", "POST users", "POST users"]);
    expect(writes[0].body).toEqual({ department: "zentrale" });
    // Nothing is ever written to the account without the mark.
    expect(t.calls.some((c) => c.method !== "GET" && c.url.includes("id-stranger"))).toBe(false);
    expect(t.lines.join("\n")).toContain("left alone");
    // The chosen password goes to the one sign-in person; everybody else gets a random one. Neither is logged.
    const posted = (i: number) => (writes[i].body as { passwordProfile: { password: string } }).passwordProfile.password;
    expect(posted(2)).toBe("chosen-by-kevin-1");
    expect(posted(1)).not.toBe("chosen-by-kevin-1");
    const said = t.lines.join("\n");
    expect(said).not.toContain("chosen-by-kevin-1");
    expect(said).not.toContain(posted(1));
    expect(said).not.toContain(TOKEN);
  });

  it("sets each manager through $ref and creates nothing on a second run", async () => {
    const wanted = wantedUsers(people, { emailDomain: DOMAIN, extraJoiners: 0, leavers: 0, limit: null });
    const store = new Map<string, Record<string, unknown>>();
    const tenant = (c: Call): Reply => {
      if (isList(c)) return { status: 200, body: { value: [...store.values()] } };
      if (c.method === "POST") {
        const b = c.body as Record<string, unknown>;
        const id = `id-${store.size + 1}`;
        store.set(id, { ...b, id, passwordProfile: undefined });
        return { status: 201, body: { id } };
      }
      return { status: 204 };
    };
    const first = fake(tenant);
    expect(await syncUsers(first.deps, wanted)).toEqual({ created: 3, updated: 0, unchanged: 0, foreign: 0, failed: 0, managersSet: 2, managersSkipped: 0 });
    const refs = first.calls.filter((c) => c.method === "PUT");
    expect(refs.map((c) => c.url)).toEqual([`${GRAPH}users/id-2/manager/$ref`, `${GRAPH}users/id-3/manager/$ref`]);
    expect(refs.map((c) => c.body)).toEqual([managerRef("id-1"), managerRef("id-2")]);
    // Managers come after every create.
    expect(first.calls.findIndex((c) => c.method === "PUT")).toBeGreaterThan(first.calls.map((c) => c.method).lastIndexOf("POST"));

    const second = fake(tenant);
    expect(await syncUsers(second.deps, wanted)).toMatchObject({ created: 0, updated: 0, unchanged: 3, failed: 0 });
    expect(second.calls.some((c) => c.method === "POST" || c.method === "PATCH")).toBe(false);
  });

  it("stops at once when the token may not write", async () => {
    const wanted = wantedUsers(people, { emailDomain: DOMAIN, extraJoiners: 0, leavers: 0, limit: null });
    const t = fake((c) => (isList(c) ? { status: 200, body: { value: [] } } : { status: 403, body: { error: { code: "Authorization_RequestDenied", message: "Insufficient privileges to complete the operation." } } }));
    await expect(syncUsers(t.deps, wanted)).rejects.toThrow(/403 Authorization_RequestDenied[\s\S]*User\.ReadWrite\.All/);
    expect(t.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("deletes only users with the mark in the domain", async () => {
    const t = fake((c) => {
      if (c.url.startsWith(`${GRAPH}organization`)) return orgs(DOMAIN);
      if (isList(c)) {
        expect(decodeURIComponent(c.url)).toContain("$filter=startswith(employeeId,'NXTST-')");
        return { status: 200, body: { value: [
          { id: "a", userPrincipalName: `b.ours@${DOMAIN}`, employeeId: "NXTST-P0002" },
          { id: "b", userPrincipalName: `a.ours@${DOMAIN}`, employeeId: "NXTST-J0001" },
          { id: "c", userPrincipalName: `admin@${DOMAIN}`, employeeId: "4711" },
          { id: "d", userPrincipalName: "marked@other.example", employeeId: "NXTST-P0009" },
          { id: "e", userPrincipalName: `nothing@${DOMAIN}` },
        ] } };
      }
      return { status: 204 };
    });
    expect(await deletable(t.deps, DOMAIN, null)).toEqual([{ id: "b", upn: `a.ours@${DOMAIN}` }, { id: "a", upn: `b.ours@${DOMAIN}` }]);
    expect(await deletable(t.deps, DOMAIN, 1)).toEqual([{ id: "b", upn: `a.ours@${DOMAIN}` }]);
    expect(await deleteUsers(t.deps, await deletable(t.deps, DOMAIN, null))).toEqual({ deleted: 2, failed: 0 });
    expect(t.calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([`${GRAPH}users/b`, `${GRAPH}users/a`]);

    // A dry run of --delete lists them and deletes nothing.
    const before = t.calls.filter((c) => c.method === "DELETE").length;
    expect(await main(["--delete", "--email-domain", DOMAIN, "--dry-run"], { GRAPH_TOKEN: TOKEN }, t.deps)).toBe(0);
    expect(t.calls.filter((c) => c.method === "DELETE")).toHaveLength(before);
    expect(t.lines.join("\n")).toContain("2 users with the NXTST- mark");
  });

  it("needs a token for a real run and never prints it", async () => {
    const t = fake(() => orgs(DOMAIN));
    await expect(main(["--people", "missing.json", "--email-domain", DOMAIN], {}, t.deps)).rejects.toThrow(/GRAPH_TOKEN is not set/);
    expect(t.calls).toHaveLength(0);
  });
});
