import { describe, expect, it } from "vitest";
import { parseSuccessFactorsSettings } from "@/features/directory/successfactors-settings";
import { buildAssertion, signAssertion } from "@/server/directory/successfactors/assertion";
import { verifyAssertion } from "../../fixtures/successfactors/fake-fetch";
import { makeTestKeys } from "../../fixtures/successfactors/keys";

const NOW = new Date("2026-11-03T10:00:00.000Z");
const input = { apiHost: "https://api4.example.test", clientId: "client-abc", apiUserId: "NEXTUP_API", now: NOW, id: "_a1" };

describe("SFX assertion", () => {
  const keys = makeTestKeys();
  const other = makeTestKeys("someone-else");

  it("carries issuer, NameID, recipient, audience, api_key and the time window", () => {
    const xml = buildAssertion(input);
    expect(xml).toContain("<saml2:Issuer>www.successfactors.com</saml2:Issuer>");
    expect(xml).toMatch(/<saml2:NameID[^>]*>NEXTUP_API<\/saml2:NameID>/);
    expect(xml).toContain('Recipient="https://api4.example.test/oauth/token"');
    expect(xml).toContain("<saml2:Audience>www.successfactors.com</saml2:Audience>");
    expect(xml).toMatch(/Attribute Name="api_key"><saml2:AttributeValue>client-abc</);
    expect(xml).toContain('NotBefore="2026-11-03T09:55:00Z"');
    expect(xml).toContain('NotOnOrAfter="2026-11-03T10:10:00Z"');
    expect(xml).toContain("AuthnStatement");
    expect(xml).toContain('Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"');
  });

  it("escapes values", () => {
    expect(buildAssertion({ ...input, apiUserId: 'a"<b>&' })).toContain("a&quot;&lt;b&gt;&amp;");
  });

  it("is signed so that it verifies with the certificate and not with another one", () => {
    const signed = signAssertion(buildAssertion(input), keys.privateKeyPem);
    expect(signed).toContain("rsa-sha256");
    expect(signed).toContain("xml-exc-c14n");
    expect(verifyAssertion(signed, keys.certPem)).toBe(true);
    expect(verifyAssertion(signed, other.certPem)).toBe(false);
  });

  it("fails verification when the content is changed after signing", () => {
    const signed = signAssertion(buildAssertion(input), keys.privateKeyPem);
    expect(verifyAssertion(signed.replace("NEXTUP_API", "ADMIN"), keys.certPem)).toBe(false);
  });

  it("does not leak the key when signing fails", () => {
    expect(() => signAssertion(buildAssertion(input), "-----BEGIN PRIVATE KEY-----\nsecretbits\n-----END PRIVATE KEY-----")).toThrow(
      /^SuccessFactors assertion signing failed$/,
    );
  });

  it("settings parser accepts a good host and refuses bad ones", () => {
    const good = { apiHost: "https://api4.example.test/", companyId: "C1", clientId: "id", apiUserId: "u" };
    const ok = parseSuccessFactorsSettings(good);
    expect(ok).toEqual({ ok: true, value: { ...good, apiHost: "https://api4.example.test" } });
    for (const apiHost of ["http://api4.example.test", "https://api4.example.test/odata", "nonsense", "https://u:p@x.test"]) {
      const r = parseSuccessFactorsSettings({ ...good, apiHost });
      expect(r.ok, apiHost).toBe(false);
    }
    const empty = parseSuccessFactorsSettings({ ...good, clientId: "  " });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors.map((e) => e.field)).toEqual(["clientId"]);
    expect(parseSuccessFactorsSettings({ ...good, companyId: "x".repeat(101) }).ok).toBe(false);
    expect(parseSuccessFactorsSettings(null).ok).toBe(false);
  });

  it("allows http://127.0.0.1 under vitest only", () => {
    const s = { apiHost: "http://127.0.0.1:4000", companyId: "C", clientId: "i", apiUserId: "u" };
    expect(parseSuccessFactorsSettings(s).ok).toBe(true);
    expect(parseSuccessFactorsSettings({ ...s, apiHost: "http://localhost:4000" }).ok).toBe(false);
  });
});
