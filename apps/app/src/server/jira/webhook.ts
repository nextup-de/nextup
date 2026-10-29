// Checking that a call to the Jira webhook route really comes from the company's Jira: an HMAC-SHA256
// of the raw body under the webhook secret the admin set, sent in a header. The body is never used
// as data - a valid call only makes the sync read Jira sooner (kickJira). Not a "use server" module.
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TBD - confirm on the live site (docs/plans/2026-10-29_jira-in-app.md, live test step 11). Jira
 * Cloud's admin webhooks document `X-Hub-Signature: sha256=<hex>` when a secret is set; if the
 * real site names it differently, change it here and nowhere else.
 */
export const SIGNATURE_HEADER = "x-hub-signature";

/** The most body the route reads. A Jira event is a few KB; this only stops a flood. */
export const MAX_WEBHOOK_BODY = 256 * 1024;

/** Is `header` ("sha256=<hex>") the HMAC-SHA256 of `rawBody` under `secret`? Constant-time. */
export function verifyJiraSignature(secret: string, rawBody: string, header: string | null | undefined): boolean {
  if (!secret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(m[1], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
