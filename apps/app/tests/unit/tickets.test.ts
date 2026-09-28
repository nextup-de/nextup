// Bug reports: what gets checked before anything is stored or sent (features/tickets) and the
// message the stack sends to admin.sellux.ch (packages/contracts).
import { describe, expect, it } from "vitest";
import { RepliesResponse, TicketIntake, ticketLabel } from "@nextup/contracts";
import { ReportInput, confirmationMail, parseScreenshot, replyMail, reporterRef, toIntake } from "@/features/tickets";

// Smallest valid images: magic bytes plus padding.
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const dataUrl = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString("base64")}`;

const context = { path: "/raise", userAgent: "test", viewport: "1280x800", consoleErrors: [], failedRequests: [] };

describe("parseScreenshot", () => {
  it("accepts png, webp and jpeg whose bytes match the claimed type", () => {
    expect(parseScreenshot(dataUrl("image/png", png))).toMatchObject({ mime: "image/png" });
    expect(parseScreenshot(dataUrl("image/webp", webp))).toMatchObject({ mime: "image/webp" });
    expect(parseScreenshot(dataUrl("image/jpeg", jpeg))).toMatchObject({ mime: "image/jpeg" });
  });

  it("refuses a type the bytes don't back up", () => {
    expect(parseScreenshot(dataUrl("image/png", jpeg))).toHaveProperty("error");
    expect(parseScreenshot(dataUrl("image/png", Buffer.from("<svg onload=alert(1)>")))).toHaveProperty("error");
  });

  it("refuses anything that is not an image data: URL", () => {
    expect(parseScreenshot("data:image/svg+xml;base64,PHN2Zz4=")).toHaveProperty("error");
    expect(parseScreenshot("data:text/html;base64,PGgxPg==")).toHaveProperty("error");
    expect(parseScreenshot("https://evil.example/x.png")).toHaveProperty("error");
  });

  it("refuses more than 2.5 MB", () => {
    const big = Buffer.concat([png, Buffer.alloc(2_600_000)]);
    expect(parseScreenshot(dataUrl("image/png", big))).toEqual({ error: "The screenshot is too large." });
  });
});

describe("ReportInput", () => {
  it("needs a description, trims it, and defaults expected", () => {
    const ok = ReportInput.safeParse({ kind: "bug", impact: "blocks", description: "  it broke  ", context, screenshot: null });
    expect(ok.success && ok.data).toMatchObject({ description: "it broke", expected: "" });
    expect(ReportInput.safeParse({ kind: "bug", impact: "blocks", description: "   ", context, screenshot: null }).success).toBe(false);
  });

  it("only knows the three kinds and three impacts", () => {
    expect(ReportInput.safeParse({ kind: "rant", impact: "blocks", description: "x", context, screenshot: null }).success).toBe(false);
    expect(ReportInput.safeParse({ kind: "bug", impact: "urgent", description: "x", context, screenshot: null }).success).toBe(false);
  });

  it("caps the log lines the browser may send", () => {
    const flood = { ...context, consoleErrors: Array.from({ length: 21 }, () => "err") };
    expect(ReportInput.safeParse({ kind: "bug", impact: "blocks", description: "x", context: flood, screenshot: null }).success).toBe(false);
  });

  it("takes up to ten recent pages, and still takes a report without them", () => {
    const visit = (path: string) => ({ path, at: "2026-09-28T10:00:00.000Z" });
    const ten = { ...context, recentPages: Array.from({ length: 10 }, (_, i) => visit(`/acme/p${i}`)) };
    expect(ReportInput.safeParse({ kind: "bug", impact: "blocks", description: "x", context: ten, screenshot: null }).success).toBe(true);
    const eleven = { ...context, recentPages: Array.from({ length: 11 }, (_, i) => visit(`/acme/p${i}`)) };
    expect(ReportInput.safeParse({ kind: "bug", impact: "blocks", description: "x", context: eleven, screenshot: null }).success).toBe(false);
    expect(ReportInput.safeParse({ kind: "bug", impact: "blocks", description: "x", context, screenshot: null }).success).toBe(true);
  });
});

describe("reporterRef", () => {
  it("is stable per person, different per person, and never the id itself", () => {
    const a = reporterRef("user_1", "secret");
    expect(a).toBe(reporterRef("user_1", "secret"));
    expect(a).not.toBe(reporterRef("user_2", "secret"));
    expect(a).not.toContain("user_1");
  });

  it("differs between stacks (another secret), so refs can't be matched across companies", () => {
    expect(reporterRef("user_1", "stack-a")).not.toBe(reporterRef("user_1", "stack-b"));
  });

  it("is 'admin' for a report without a person", () => {
    expect(reporterRef(null, "secret")).toBe("admin");
  });
});

describe("toIntake", () => {
  const row = {
    id: "ckticket1",
    number: 7,
    kind: "bug",
    impact: "annoying",
    description: "The button does nothing",
    expected: "It saves",
    reporterId: "user_1",
    reporterRole: "member",
    context: { ...context, stage: "demo", appCommit: "abc1234" },
    screenshot: new Uint8Array(png),
    screenshotMime: "image/png",
    createdAt: new Date("2026-09-28T10:00:00Z"),
  };

  it("builds a message the contract accepts, with a pseudonym instead of the person", () => {
    const msg = toIntake(row, "acme", "secret");
    expect(TicketIntake.parse(msg)).toBeTruthy();
    expect(msg).toMatchObject({ stackTicketId: "ckticket1", number: 7, companySlug: "acme", reporterRole: "member" });
    expect(JSON.stringify(msg)).not.toContain("user_1");
    expect(Buffer.from(msg.screenshot!.base64, "base64").equals(png)).toBe(true);
  });

  it("sends null when there is no screenshot", () => {
    expect(toIntake({ ...row, screenshot: null, screenshotMime: null }, "acme", "s").screenshot).toBeNull();
  });
});

describe("contract", () => {
  it("rejects a reply list of another version", () => {
    expect(RepliesResponse.safeParse({ contractVersion: 2, replies: [] }).success).toBe(false);
    expect(RepliesResponse.safeParse({ contractVersion: 1, replies: [] }).success).toBe(true);
  });
  it("labels tickets NU-<n>", () => {
    expect(ticketLabel(12)).toBe("NU-12");
  });
});

describe("mails", () => {
  it("confirms with the person's own words and where to follow it", () => {
    const m = confirmationMail("NU-3", { kind: "bug", description: "It broke", expected: "It works" }, "https://acme.sellux.ch/reports");
    expect(m.subject).toBe("NU-3: we have your bug report");
    expect(m.text).toContain("It broke");
    expect(m.text).toContain("It works");
    expect(m.text).toContain("https://acme.sellux.ch/reports");
  });
  it("tells the status with the reply", () => {
    expect(replyMail("NU-3", "fixed", "Done in 1.8", "u").subject).toContain("fixed");
  });
});
