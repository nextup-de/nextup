// The webhook's HMAC check (server/jira/webhook.ts). The route itself only calls this and kickJira.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SIGNATURE_HEADER, verifyJiraSignature } from "@/server/jira/webhook";

const sign = (secret: string, body: string) => "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
const BODY = JSON.stringify({ webhookEvent: "jira:issue_updated", issue: { key: "NUP-2" } });

describe("jira webhook signature", () => {
  it("accepts the HMAC-SHA256 of the raw body under the secret", () => {
    expect(verifyJiraSignature("s3cret", BODY, sign("s3cret", BODY))).toBe(true);
    expect(verifyJiraSignature("s3cret", BODY, " " + sign("s3cret", BODY).toUpperCase().replace("SHA256", "sha256") + " ")).toBe(true);
  });

  it("refuses another secret, a changed body, and a missing or malformed header", () => {
    expect(verifyJiraSignature("s3cret", BODY, sign("other", BODY))).toBe(false);
    expect(verifyJiraSignature("s3cret", BODY + " ", sign("s3cret", BODY))).toBe(false);
    for (const bad of [null, undefined, "", "sha256=", "sha256=abc", "sha1=" + "a".repeat(40), sign("s3cret", BODY).slice(7), "sha256=" + "z".repeat(64)]) {
      expect(verifyJiraSignature("s3cret", BODY, bad)).toBe(false);
    }
  });

  it("an empty secret never verifies, even against the HMAC under an empty key", () => {
    expect(verifyJiraSignature("", BODY, sign("", BODY))).toBe(false);
  });

  it("the header name is lower case, one place to change once the live site confirms it", () => {
    expect(SIGNATURE_HEADER).toBe(SIGNATURE_HEADER.toLowerCase());
  });
});
