import { describe, expect, it } from "vitest";
import {
  EXPORT_DENY, buildCompanyExport, buildPersonExport, composeExportMail, hasVerifiedEmail, isDenied, stripDenied,
  type ExportRows, type Row,
} from "@/features/privacy/export";

const T0 = new Date("2026-11-02T10:00:00.000Z");
const FILLED: Row = {
  employeeId: "E-1", loginCodeHash: "lch", entraOid: "oid", apiTokenHash: "ath", totpSecretSealed: "ts", refreshTokenSealed: "rt",
  secretSealed: "s", webhookSecretSealed: "w", sessionToken: "st", tokenHash: "th", hash: "keep-me", file: "keep-me-too",
};
const user = (id: string, name: string): Row => ({ id, name, email: `${id}@x.example`, role: "member", createdAt: T0, ...FILLED });

function rows(): ExportRows {
  const shot = Buffer.from("PNGDATA");
  return {
    company: { id: "c1", slug: "acme", name: "Acme", mark: "A", stage: "pilot", anonymousHandles: true, createdAt: T0, accessCodeHash: "x", sessionEpoch: 3, seedJson: {} },
    exportedAt: T0,
    identities: { u1: "Person 1", u2: "Bea Two" },
    tables: {
      users: [user("u1", "Old Name One"), user("u2", "Bea Two")],
      seats: [{ id: "s1", userId: "u1", name: "Seat 1" }, { id: "s2", userId: "u2", name: "Seat 2" }],
      events: [
        { id: "e1", actor: "Old Name One", actorUserId: "u1", ts: T0, payload: { employeeId: "E-1", note: "n" } },
        { id: "e2", actor: "Bea Two", actorUserId: "u2", ts: T0, payload: {} },
        { id: "e3", actor: "system:n8n", actorUserId: null, ts: T0, payload: {} },
      ],
      caseViews: [{ caseId: "k1", fromUserId: "u1" }, { caseId: "k2", fromUserId: "u2" }],
      assistTurns: [{ id: "a1", userId: "u1", text: "q" }, { id: "a2", userId: "u2", text: "q" }],
      ideaDrafts: [
        { id: "d1", userId: "u1", status: "draft" }, { id: "d2", userId: "u1", status: "published" },
        { id: "d3", userId: "u2", status: "discarded" },
      ],
      ideaTurns: [{ id: "t1", draftId: "d1", text: "x" }, { id: "t2", draftId: "d3", text: "y" }],
      tickets: [
        { id: "k1", reporterId: "u1", screenshot: shot, screenshotMime: "image/png", description: "a" },
        { id: "k2", reporterId: "u2", screenshot: shot, screenshotMime: "image/png", description: "b" },
      ],
      ticketReplies: [{ id: "r1", ticketId: "k1" }, { id: "r2", ticketId: "k2" }],
      notifyPreferences: [{ userId: "u1", template: "raised", on: true }, { userId: "u2", template: "raised", on: false }],
      connections: [{ id: "n1", userId: "u1", provider: "m365", scopes: ["x"], refreshTokenSealed: "r", createdAt: T0 }],
      auditEvents: [
        { id: "x1", actorUserId: "u1", targetId: "u9", at: T0 }, { id: "x2", actorUserId: "u9", targetId: "u1", at: T0 },
        { id: "x3", actorUserId: "u2", targetId: "u9", at: T0 },
      ],
      integrations: [{ id: "i1", system: "jira", secretSealed: "z" }],
      floorDevices: [{ id: "f1", tokenHash: "t", pairCodeHash: "p", label: "L" }],
    },
  };
}

const walk = (v: unknown, visit: (k: string, val: unknown) => void): void => {
  if (Array.isArray(v)) v.forEach((x) => walk(x, visit));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { visit(k, x); walk(x, visit); }
};

describe("GDP export shape", () => {
  const files = () => [
    buildCompanyExport(rows()),
    buildPersonExport(rows(), { userId: "u1", toPerson: true }),
    buildPersonExport(rows(), { userId: "u1", toPerson: false }),
  ];

  it("has the D14 envelope, ids kept, dates as ISO strings", () => {
    const f = buildCompanyExport(rows());
    expect(f).toMatchObject({ format: "nextup-export", version: 1, kind: "company", exportedAt: T0.toISOString() });
    expect(f.company).toEqual({ id: "c1", slug: "acme", name: "Acme", mark: "A", stage: "pilot", anonymousHandles: true, createdAt: T0.toISOString() });
    expect(f.tables.users.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(f.tables.users[0].createdAt).toBe(T0.toISOString());
    for (const file of files()) walk(file, (_k, v) => expect(v instanceof Date).toBe(false));
  });

  it("never holds a D5 key anywhere in either export, but keeps generic hash and file", () => {
    for (const file of files()) walk(file, (k) => expect(isDenied(k), k).toBe(false));
    expect(EXPORT_DENY).toEqual(expect.arrayContaining(["employeeId", "loginCodeHash", "entraOid", "apiTokenHash", "totpSecretSealed"]));
    expect(EXPORT_DENY).not.toContain("hash");
    expect(EXPORT_DENY).not.toContain("file");
    const kept = buildCompanyExport(rows()).tables.users[0];
    expect(kept.hash).toBe("keep-me");
    expect(kept.file).toBe("keep-me-too");
    expect(stripDenied({ a: [{ entraOid: "x", b: 1 }], c: { fooSealed: "y" } })).toEqual({ a: [{ b: 1 }], c: {} });
  });

  it("gives a person only their own events and seats", () => {
    const f = buildPersonExport(rows(), { userId: "u1", toPerson: true });
    expect(f.kind).toBe("person");
    expect(f.tables.events.map((e) => e.id)).toEqual(["e1"]);
    expect(f.tables.seats.map((s) => s.id)).toEqual(["s1"]);
    expect(f.tables.users.map((u) => u.id)).toEqual(["u1"]);
    expect(f.tables.caseViews.map((c) => c.caseId)).toEqual(["k1"]);
    expect(f.tables.notifyPreferences.map((p) => p.userId)).toEqual(["u1"]);
    expect(f.tables.auditEvents.map((a) => a.id)).toEqual(["x1", "x2"]);
    expect(f.tables.connections[0]).toEqual({ id: "n1", provider: "m365", createdAt: T0.toISOString() });
  });

  it("leaves assistant turns and idea drafts out of an admin copy, and gives them to the person", () => {
    const admin = buildPersonExport(rows(), { userId: "u1", toPerson: false });
    for (const t of ["assistTurns", "ideaDrafts", "ideaTurns"]) expect(admin.tables[t]).toBeUndefined();
    const own = buildPersonExport(rows(), { userId: "u1", toPerson: true });
    expect(own.tables.assistTurns.map((a) => a.id)).toEqual(["a1"]);
    expect(own.tables.ideaDrafts.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(own.tables.ideaTurns.map((d) => d.id)).toEqual(["t1"]);
  });

  it("keeps no draft or discarded idea and no idea turn in the company export", () => {
    const f = buildCompanyExport(rows());
    expect(f.tables.ideaDrafts.map((d) => d.id)).toEqual(["d2"]);
    expect(f.tables.ideaTurns).toBeUndefined();
  });

  it("includes a person's own ticket screenshot as base64 and no screenshot in the company export", () => {
    const own = buildPersonExport(rows(), { userId: "u1", toPerson: true });
    expect(own.tables.tickets).toHaveLength(1);
    expect(own.tables.tickets[0].screenshotBase64).toBe(Buffer.from("PNGDATA").toString("base64"));
    expect(own.tables.ticketReplies.map((r) => r.id)).toEqual(["r1"]);
    const co = JSON.stringify(buildCompanyExport(rows()));
    expect(co).not.toContain(Buffer.from("PNGDATA").toString("base64"));
    for (const t of buildCompanyExport(rows()).tables.tickets) {
      expect(t.screenshot).toBeUndefined();
      expect(t.screenshotBase64).toBeUndefined();
      expect(t.hasScreenshot).toBe(true);
    }
  });

  it("writes an event's actor from the user's current label, never the stored string", () => {
    for (const f of [buildCompanyExport(rows()), buildPersonExport(rows(), { userId: "u1", toPerson: true })]) {
      const e1 = f.tables.events.find((e) => e.id === "e1")!;
      expect(e1.actor).toBe("Person 1");
      expect(e1.actorUserId).toBe("u1");
      expect(JSON.stringify(f.tables.events)).not.toContain("Old Name One");
    }
    const co = buildCompanyExport(rows());
    expect(co.tables.events.find((e) => e.id === "e3")!.actor).toBe("system:n8n");
    const gone = rows();
    gone.identities = {};
    expect(buildCompanyExport(gone).tables.events[0].actor).toBe("former member");
  });

  it("composes the mail with one link to the page and the expiry", () => {
    const m = composeExportMail({ name: "L. Brandt", companyName: "Acme", sizeBytes: 2.4 * 1024 * 1024, expiresAt: T0, url: "https://x.test/acme/exports/ex1", locale: "en" });
    expect(m.subject).toBe("Your data from NextUp at Acme is ready");
    expect(m.text).toContain("https://x.test/acme/exports/ex1");
    expect(m.text).toContain("2.4 MB");
    expect(composeExportMail({ name: "L", companyName: "Acme", sizeBytes: 10, expiresAt: T0, url: "u", locale: "de" }).subject).toContain("liegen bereit");
  });

  it("calls an address verified only when it came from the directory or Microsoft", () => {
    expect(hasVerifiedEmail({ email: "a@b.co", entraOid: "o", directorySyncedAt: null })).toBe(true);
    expect(hasVerifiedEmail({ email: "a@b.co", entraOid: null, directorySyncedAt: T0 })).toBe(true);
    expect(hasVerifiedEmail({ email: "a@b.co", entraOid: null, directorySyncedAt: null })).toBe(false);
    expect(hasVerifiedEmail({ email: "nope", entraOid: "o", directorySyncedAt: null })).toBe(false);
  });
});
