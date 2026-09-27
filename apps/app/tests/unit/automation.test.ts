// The /admin case-notices verdict. Pure, so no server and no mail relay: the point is that each
// state is reachable and that a notice on a case - not a relay that answers - is what counts as
// "working".
import { describe, expect, it } from "vitest";
import {
  describeCompany,
  summarise,
  type CompanyAutomation,
  type NoticeFacts,
} from "@/features/integrations/automation";

const facts = (over: Partial<NoticeFacts> = {}): NoticeFacts => ({
  configured: true,
  reachable: true,
  target: "mailpit:1025",
  ...over,
});

const company = (over: Partial<CompanyAutomation> = {}): CompanyAutomation => ({
  slug: "acme",
  name: "Acme",
  notices: 0,
  lastNoticeAt: null,
  ...over,
});

describe("summarise", () => {
  it("is off when SMTP_URL is not set", () => {
    const s = summarise(facts({ configured: false, reachable: null, target: null }), [company()], 0);
    expect(s.state).toBe("off");
    expect(s.headline).toContain("SMTP_URL");
  });

  it("is unreachable when the relay does not answer, and names it", () => {
    const s = summarise(facts({ reachable: false }), [company({ notices: 4 })], 3);
    // Unreachable wins over past notices: what matters is whether the next raise gets through.
    expect(s.state).toBe("unreachable");
    expect(s.next).toContain("mailpit:1025");
  });

  it("says so plainly when nothing has been raised yet", () => {
    const s = summarise(facts(), [company()], 0);
    expect(s.state).toBe("idle");
    expect(s.next).toContain("Nothing has been raised");
  });

  it("points at the task list when raises exist but nobody was emailed", () => {
    const s = summarise(facts(), [company()], 4);
    expect(s.state).toBe("idle");
    expect(s.next).toContain("no email address");
  });

  it("is live only once a notice exists", () => {
    expect(summarise(facts(), [company()], 4).state).toBe("idle");
    expect(summarise(facts(), [company({ notices: 1 })], 4).state).toBe("live");
  });

  it("counts how many companies are live when only some are", () => {
    const s = summarise(facts(), [company({ notices: 2 }), company({ slug: "beta" })], 4);
    expect(s.state).toBe("live");
    expect(s.headline).toContain("1 of 2");
    expect(s.next).toBeNull();
  });
});

describe("describeCompany", () => {
  it("counts the owners told", () => {
    expect(describeCompany(company())).toBe("No owner notified yet.");
    expect(describeCompany(company({ notices: 1 }))).toBe("1 owner notified.");
    expect(describeCompany(company({ notices: 3 }))).toBe("3 owners notified.");
  });
});
