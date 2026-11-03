import { describe, expect, it } from "vitest";
import { testAnalyticsFor, testEventFor, testerCode, upstreamFor } from "@/features/testing/analytics";

describe("test analytics", () => {
  it("records only demo-stage companies with a key", () => {
    expect(testAnalyticsFor("acme", "demo", "phc_x")).toEqual({ key: "phc_x", ingest: "/api/acme/ingest" });
    expect(testAnalyticsFor("acme", undefined, "phc_x")).not.toBeNull();
    for (const stage of ["sandbox", "pilot", "live", "unknown"]) expect(testAnalyticsFor("acme", stage, "phc_x")).toBeNull();
    expect(testAnalyticsFor("acme", "demo", undefined)).toBeNull();
    expect(testAnalyticsFor("acme", "demo", "")).toBeNull();
  });

  it("accepts participant codes P01-P999 only", () => {
    expect(testerCode("P01")).toBe("P01");
    expect(testerCode(" p123 ")).toBe("P123");
    for (const bad of [null, undefined, "", "P1", "P1234", "kevin", "P01;x", "off"]) expect(testerCode(bad)).toBeNull();
  });

  it("forwards plain paths to the EU hosts and refuses anything else", () => {
    expect(upstreamFor(["e", ""], "")).toBeNull();
    expect(upstreamFor(["i", "v0", "e"], "?ip=0")).toBe("https://eu.i.posthog.com/i/v0/e?ip=0");
    expect(upstreamFor(["static", "recorder.js"], "?v=1")).toBe("https://eu-assets.i.posthog.com/static/recorder.js?v=1");
    expect(upstreamFor(["array", "phc_x", "config.js"], "")).toBe("https://eu-assets.i.posthog.com/array/phc_x/config.js");
    for (const bad of [[], [".."], ["a", "."], ["a/b"], ["a\\b"], ["a?b"]]) expect(upstreamFor(bad, "")).toBeNull();
  });

  it("turns case events into funnel events without anything anyone wrote", () => {
    const raised = testEventFor("case.raised", { title: "Secret plan", body: "text", routeId: "r1", proposal: { routeId: "r1", confidence: 80, source: "keywords", version: "k1" } });
    expect(raised).toEqual({ name: "case_published", props: { kind: "idea", routeAsProposed: true, attachments: 0 } });
    expect(JSON.stringify(raised)).not.toContain("Secret");
    expect(testEventFor("case.decided", { answer: "no", reason: "Budget is spent" })).toEqual({ name: "case_answered", props: { answer: "no", reasoned: true } });
    expect(testEventFor("case.decided", { answer: "no" })?.props.reasoned).toBe(false);
    expect(testEventFor("case.handed", { to: "IT" })).toEqual({ name: "case_answered", props: { answer: "handover", reasoned: false } });
    expect(testEventFor("case.override", { proposed: "r1", chosen: "r2" })?.name).toBe("owner_overridden");
    expect(testEventFor("project.commented", { text: "x" })).toBeNull();
  });
});
