// Answering and editing pilot requests in /admin/requests. The rules the panel and the server
// action share: what a reply must contain, when a request is overdue, what an edit may change.
import { describe, expect, it } from "vitest";
import {
  filterRequests,
  isOverdue,
  isRequestView,
  mailtoHref,
  readEdit,
  readReply,
  replyDraft,
  replySubject,
  validateEdit,
  validateReply,
  workingDaysBetween,
} from "@/features/admin/requests";

const request = {
  name: "K. Berger",
  company: "Berger AG",
  email: "k.berger@example.com",
  decision: "Approving a tool under 5k",
  council: "no",
  message: "Two sites.\nOne department first.",
  notes: "",
};

// 2026-09-21 is a Monday.
const at = (day: string, time = "10:00") => new Date(`${day}T${time}:00Z`);

describe("working days", () => {
  it("counts Monday to Friday, not the day it came in", () => {
    expect(workingDaysBetween(at("2026-09-21"), at("2026-09-21", "18:00"))).toBe(0);
    expect(workingDaysBetween(at("2026-09-21"), at("2026-09-23"))).toBe(2);
  });

  it("skips the weekend", () => {
    // Friday -> Monday is one working day, not three.
    expect(workingDaysBetween(at("2026-09-25"), at("2026-09-28"))).toBe(1);
  });
});

describe("isOverdue", () => {
  it("is past the two-working-day promise and still open", () => {
    expect(isOverdue({ createdAt: at("2026-09-21").toISOString(), handledAt: null }, at("2026-09-23"))).toBe(false);
    expect(isOverdue({ createdAt: at("2026-09-21").toISOString(), handledAt: null }, at("2026-09-24"))).toBe(true);
  });

  it("is never true once replied to", () => {
    expect(isOverdue({ createdAt: at("2026-09-01").toISOString(), handledAt: at("2026-09-02").toISOString() }, at("2026-09-30"))).toBe(false);
  });
});

describe("reply", () => {
  it("starts from a draft that greets the person and quotes what they asked", () => {
    const draft = replyDraft(request);
    expect(draft.startsWith("Hello K. Berger,")).toBe(true);
    expect(draft).toContain("> Approving a tool under 5k");
    expect(draft).toContain("> One department first.");
    expect(replySubject(request)).toBe("Re: your NextUp pilot request - Berger AG");
  });

  it("needs a subject and a body", () => {
    expect(validateReply({ subject: "", body: "" })).toHaveLength(2);
    expect(validateReply({ subject: "Re: hi", body: "Thanks" })).toEqual([]);
  });

  it("normalises line endings from a textarea", () => {
    const fd = new FormData();
    fd.set("subject", "  Re: hi ");
    fd.set("body", "a\r\nb\r\n");
    expect(readReply(fd)).toEqual({ subject: "Re: hi", body: "a\nb" });
  });

  it("builds a mailto the mail app can open", () => {
    const href = mailtoHref("a@b.ch", { subject: "Re: x & y", body: "line 1\nline 2" });
    expect(href).toBe("mailto:a@b.ch?subject=Re%3A%20x%20%26%20y&body=line%201%0Aline%202");
  });
});

describe("edit", () => {
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...request, ...over })) fd.set(k, v);
    return readEdit(fd);
  };

  it("accepts what the public form would reject as a throwaway, so notes can still be saved", () => {
    expect(validateEdit(form({ name: "Test" }))).toEqual([]);
  });

  it("refuses an address that would bounce, an unknown council answer, and empty required fields", () => {
    expect(validateEdit(form({ email: "nope" }))).toHaveLength(1);
    expect(validateEdit(form({ council: "maybe" }))).toHaveLength(1);
    expect(validateEdit(form({ name: "", company: "", decision: "" }))).toHaveLength(3);
  });

  it("lower-cases the e-mail", () => {
    expect(form({ email: "K.Berger@Example.com" }).email).toBe("k.berger@example.com");
  });
});

describe("views", () => {
  const rows = [{ handledAt: null }, { handledAt: "2026-09-22T10:00:00Z" }];

  it("splits open from replied, and all is all", () => {
    expect(filterRequests(rows, "open")).toHaveLength(1);
    expect(filterRequests(rows, "replied")).toHaveLength(1);
    expect(filterRequests(rows, "all")).toHaveLength(2);
  });

  it("only knows its own view names", () => {
    expect(isRequestView("open")).toBe(true);
    expect(isRequestView("spam")).toBe(false);
    expect(isRequestView(undefined)).toBe(false);
  });
});
