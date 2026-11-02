import { describe, expect, it } from "vitest";
import { checkPlatformJob } from "@/features/admin/platform-jobs";

describe("ITC platform job rules", () => {
  it("creates a demo or sandbox company, not a live one", () => {
    for (const stage of ["demo", "sandbox"]) {
      expect(checkPlatformJob({ action: "create_company", slug: "acme-2", stage }, null)).toEqual({ ok: true });
    }
    expect(checkPlatformJob({ action: "create_company", slug: "acme-2", stage: "live" }, null)).toEqual({ ok: false, code: "bad-stage" });
    expect(checkPlatformJob({ action: "create_company", slug: "acme-2", stage: "demo" }, "demo")).toEqual({ ok: false, code: "exists" });
  });

  it("moves sandbox to live but never away from live", () => {
    expect(checkPlatformJob({ action: "set_stage", slug: "acme", stage: "live" }, "sandbox")).toEqual({ ok: true });
    expect(checkPlatformJob({ action: "set_stage", slug: "acme", stage: "sandbox" }, "live")).toEqual({ ok: false, code: "live-locked" });
    expect(checkPlatformJob({ action: "set_stage", slug: "acme", stage: "live" }, null)).toEqual({ ok: false, code: "missing" });
  });

  it("deletes demo and sandbox companies, not live ones", () => {
    expect(checkPlatformJob({ action: "delete_company", slug: "acme" }, "demo")).toEqual({ ok: true });
    expect(checkPlatformJob({ action: "delete_company", slug: "acme" }, "sandbox")).toEqual({ ok: true });
    expect(checkPlatformJob({ action: "delete_company", slug: "acme" }, "live")).toEqual({ ok: false, code: "live-locked" });
  });

  it("refuses an unknown action and a bad slug", () => {
    expect(checkPlatformJob({ action: "wipe_everything" }, null)).toEqual({ ok: false, code: "unsupported" });
    expect(checkPlatformJob({ action: "delete_company", slug: "Not A Slug" }, "demo")).toEqual({ ok: false, code: "bad-slug" });
  });
});
