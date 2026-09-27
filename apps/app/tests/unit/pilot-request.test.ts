// The pilot request rules. Pure - no database.
import { describe, expect, it } from "vitest";
import { isRealRequest, pilotMailto, readPilotRequest, validatePilotRequest, type PilotRequest } from "@/features/pilot/request";

const good: PilotRequest = {
  name: "P. Meier",
  company: "Globex AG",
  email: "p.meier@globex.test",
  decision: "approving a tool under 5k",
  council: "yes",
  message: "",
};

describe("validatePilotRequest", () => {
  it("accepts a real request", () => {
    expect(validatePilotRequest(good)).toEqual({});
    expect(isRealRequest(good)).toBe(true);
  });

  it("names every empty required field, with its own message", () => {
    const e = validatePilotRequest({ ...good, name: "", company: "", email: "", decision: "" });
    expect(Object.keys(e).sort()).toEqual(["company", "decision", "email", "name"]);
    expect(new Set(Object.values(e)).size).toBe(4);
  });

  it("rejects an address no mail server would take, accepts odd but real ones", () => {
    expect(validatePilotRequest({ ...good, email: "p.meier@globex" }).email).toBeDefined();
    expect(validatePilotRequest({ ...good, email: "p meier@globex.de" }).email).toBeDefined();
    expect(validatePilotRequest({ ...good, email: "p.meier+pilot@sub.globex.co.uk" }).email).toBeUndefined();
  });

  it("asks for more than a word on the decision", () => {
    expect(validatePilotRequest({ ...good, decision: "tools" }).decision).toBeDefined();
  });

  it("caps the free text instead of silently truncating", () => {
    expect(validatePilotRequest({ ...good, message: "x".repeat(4001) }).message).toBeDefined();
    expect(validatePilotRequest({ ...good, message: "x".repeat(4000) }).message).toBeUndefined();
  });
});

describe("readPilotRequest", () => {
  it("trims, lower-cases the address and falls back on the council", () => {
    const fd = new FormData();
    fd.set("name", "  P. Meier ");
    fd.set("email", "P.Meier@Globex.TEST");
    fd.set("council", "maybe");
    const r = readPilotRequest(fd);
    expect(r.name).toBe("P. Meier");
    expect(r.email).toBe("p.meier@globex.test");
    expect(r.council).toBe("not sure");
    expect(r.message).toBe("");
  });
});

describe("pilotMailto", () => {
  it("puts the company in the subject and every field in the body", () => {
    const href = pilotMailto("hello@example.test", good);
    expect(href.startsWith("mailto:hello@example.test?subject=")).toBe(true);
    const body = decodeURIComponent(href.split("body=")[1]);
    expect(body).toContain("Work e-mail: p.meier@globex.test");
    expect(body).toContain("approving a tool under 5k");
  });
});
