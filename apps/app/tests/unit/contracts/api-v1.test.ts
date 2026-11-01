import { describe, expect, it } from "vitest";
import * as pub from "@nextup/contracts/public";
import { ApiV1, ApiV1CaseCreate, ApiV1ListQuery, PublicEvent, WebhookEnvelope, parseSignatureHeader, signaturePayload } from "@nextup/contracts/public";
import { loadFixtures, zodExports } from "./fixtures";

const schemas = pub as unknown as Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
const exported = Object.values(pub as unknown as Record<string, unknown>);

describe("ARC API v1 and webhook schemas", () => {
  it("accepts the fixtures of events, webhook and api-v1", () => {
    const names = new Set(zodExports(pub as unknown as Record<string, unknown>).map(([n]) => n));
    const fx = [...loadFixtures("events"), ...loadFixtures("webhook"), ...loadFixtures("api-v1")];
    expect(fx.length).toBeGreaterThan(10);
    for (const f of fx) {
      expect(names.has(f.schema), f.file).toBe(true);
      expect(schemas[f.schema].safeParse(f.value).success, f.file).toBe(true);
    }
  });

  it("rejects broken input", () => {
    const ev = loadFixtures("events").find((f) => f.schema === "PublicEvent")!.value as Record<string, unknown>;
    expect(PublicEvent.safeParse({ ...ev, type: "case.exploded" }).success).toBe(false);
    expect(WebhookEnvelope.safeParse({ specVersion: 2, deliveryId: "d", attempt: 1, sentAt: "2026-10-30T08:00:02.000Z", event: ev }).success).toBe(false);
    expect(ApiV1CaseCreate.safeParse({ title: "", body: "b", kind: "idea", raisedByUserId: null, routeHint: null, externalId: null }).success).toBe(false);
    expect(ApiV1ListQuery.safeParse({ limit: "201" }).success).toBe(false);
  });

  it("builds the signature payload and parses the header", () => {
    expect(signaturePayload(1700000000, "{}")).toBe("1700000000.{}");
    expect(parseSignatureHeader("t=1700000000,v1=abc")).toEqual({ timestamp: 1700000000, v1: ["abc"] });
    expect(parseSignatureHeader("t=1700000000,v1=abc,v1=def")).toEqual({ timestamp: 1700000000, v1: ["abc", "def"] });
    expect(parseSignatureHeader("v1=abc")).toBeNull();
    expect(parseSignatureHeader("t=x,v1=abc")).toBeNull();
  });

  it("has the seven endpoints and references only exported schemas", () => {
    expect(ApiV1.endpoints.map((e) => e.id)).toEqual([
      "cases.list", "cases.get", "cases.create", "decisions.list", "projects.list", "projects.get", "org.get",
    ]);
    expect(new Set(ApiV1.endpoints.map((e) => e.id)).size).toBe(7);
    for (const e of ApiV1.endpoints) {
      expect(e.path.startsWith("/"), e.id).toBe(true);
      expect(e.scope, e.id).toMatch(/^[a-z]+:(read|write)$/);
      for (const s of [e.query, e.request, e.response]) if (s !== null) expect(exported.includes(s), e.id).toBe(true);
    }
  });
});
