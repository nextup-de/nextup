// What each raise's state means. The distinction that matters: a raise with nobody to notify
// (no route owner) must never look like one whose owner was not told, or /admin cries wolf.
import { describe, expect, it } from "vitest";
import {
  classify,
  countByState,
  describeTasks,
  PENDING_WINDOW_MS,
  type TaskInput,
} from "@/features/integrations/tasks";

const NOW = Date.parse("2026-09-23T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const raise = (over: Partial<TaskInput> = {}): TaskInput => ({
  eventId: "e_1",
  slug: "acme",
  companyName: "Acme",
  caseId: "c_1",
  title: "Line 3 stops every shift",
  ownerName: "T. Vogel",
  ownerEmail: "t.vogel@acme.example",
  raisedAt: ago(5 * 60_000),
  noticeAt: null,
  ...over,
});

describe("classify", () => {
  it("is done when the notice landed, and says how long it took", () => {
    const t = classify(raise({ raisedAt: ago(60_000), noticeAt: ago(57_000) }), NOW);
    expect(t.state).toBe("done");
    expect(t.tookMs).toBe(3000);
    expect(t.explain).toContain("3s");
    expect(t.retryable).toBe(false);
  });

  it("is skipped - not failed - when the route has no owner", () => {
    const t = classify(raise({ ownerName: null, ownerEmail: null, raisedAt: ago(86_400_000) }), NOW);
    expect(t.state).toBe("skipped");
    expect(t.explain).toContain("correct");
    // Nothing to repair: re-sending would find the same missing owner.
    expect(t.retryable).toBe(false);
  });

  it("names the owner when there is one but no address to write to", () => {
    const t = classify(raise({ ownerEmail: null, raisedAt: ago(86_400_000) }), NOW);
    expect(t.state).toBe("skipped");
    expect(t.explain).toContain("T. Vogel");
    expect(t.explain).toContain("no email");
  });

  it("is pending inside the window and failed after it", () => {
    expect(classify(raise({ raisedAt: ago(PENDING_WINDOW_MS - 1000) }), NOW).state).toBe("pending");
    const failed = classify(raise({ raisedAt: ago(PENDING_WINDOW_MS + 1000) }), NOW);
    expect(failed.state).toBe("failed");
    expect(failed.retryable).toBe(true);
  });

  it("does not report a negative duration when the clocks disagree", () => {
    const t = classify(raise({ raisedAt: ago(10_000), noticeAt: ago(20_000) }), NOW);
    expect(t.state).toBe("done");
    expect(t.tookMs).toBeNull();
    expect(t.explain).not.toContain("-");
  });
});

describe("describeTasks", () => {
  it("says so when nothing has been raised", () => {
    expect(describeTasks(countByState([]))).toContain("nobody has been notified");
  });

  it("leads with what is wrong", () => {
    const tasks = [
      classify(raise({ eventId: "a", raisedAt: ago(600_000) }), NOW),
      classify(raise({ eventId: "b", raisedAt: ago(600_000), noticeAt: ago(599_000) }), NOW),
      classify(raise({ eventId: "c", ownerEmail: null, raisedAt: ago(600_000) }), NOW),
    ];
    const line = describeTasks(countByState(tasks));
    expect(line).toContain("3 raises");
    expect(line.indexOf("1 not notified")).toBeGreaterThanOrEqual(0);
    expect(line.indexOf("1 not notified")).toBeLessThan(line.indexOf("1 notified"));
  });
});
