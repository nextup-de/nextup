// The rules for platform jobs from admin.sellux.ch (ITC D6, @nextup/contracts platform-jobs.ts).
// Pure: the stack's database work is in server/platform-jobs-sync.ts.
import { isValidSlug } from "@/features/auth/request";
import { canMoveStage } from "@/features/admin/stages";

/** A job as it came off the wire: only what the check reads, so an unknown action can be named and refused. */
export type PlatformJobInput = { action: string; slug?: unknown; stage?: unknown };

export type PlatformJobCheck =
  | { ok: true }
  | { ok: false; code: "unsupported" | "exists" | "missing" | "live-locked" | "bad-slug" | "bad-stage" };

const refuse = (code: Extract<PlatformJobCheck, { ok: false }>["code"]): PlatformJobCheck => ({ ok: false, code });

/** `current` is the company's stage now, or null when there is no such company. */
export function checkPlatformJob(job: PlatformJobInput, current: string | null): PlatformJobCheck {
  if (job.action !== "create_company" && job.action !== "set_stage" && job.action !== "delete_company") {
    return refuse("unsupported");
  }
  if (typeof job.slug !== "string" || !isValidSlug(job.slug)) return refuse("bad-slug");

  switch (job.action) {
    case "create_company":
      if (job.stage !== "demo" && job.stage !== "sandbox") return refuse("bad-stage");
      return current === null ? { ok: true } : refuse("exists");
    case "set_stage":
      if (job.stage !== "demo" && job.stage !== "sandbox" && job.stage !== "live") return refuse("bad-stage");
      if (current === null) return refuse("missing");
      if (current === "live" && job.stage !== "live") return refuse("live-locked");
      // Real people never go back to a demo (canMoveStage).
      return canMoveStage(current, job.stage) ? { ok: true } : refuse("bad-stage");
    case "delete_company":
      if (current === null) return refuse("missing");
      return current === "demo" || current === "sandbox" ? { ok: true } : refuse("live-locked");
  }
}
