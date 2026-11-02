import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSignatureHeader, signaturePayload } from "@nextup/contracts/public";
import { signatureHeader } from "@/server/notify/sign";

const body = JSON.stringify({ specVersion: 1, deliveryId: "d1" });
const t = 1_800_000_000;
const mac = (secret: string, raw: string) => createHmac("sha256", secret).update(signaturePayload(t, raw)).digest("hex");

describe("NTF webhook signature", () => {
  const header = signatureHeader(["old-secret", "new-secret"], t, body);
  const parsed = parseSignatureHeader(header);

  it("two secrets give two v1 and parseSignatureHeader reads them back", () => {
    expect(header.startsWith(`t=${t},v1=`)).toBe(true);
    expect(parsed?.timestamp).toBe(t);
    expect(parsed?.v1.length).toBe(2);
    expect(parsed?.v1[0]).not.toBe(parsed?.v1[1]);
  });

  it("recomputing with either secret matches one v1", () => {
    for (const s of ["old-secret", "new-secret"]) expect(parsed?.v1).toContain(mac(s, body));
    expect(parsed?.v1).not.toContain(mac("other-secret", body));
  });

  it("another body matches none", () => {
    const other = body + " ";
    for (const s of ["old-secret", "new-secret"]) expect(parsed?.v1).not.toContain(mac(s, other));
  });
});
