import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { certStatus, parseIdpMetadata, spMetadata } from "../../../src/features/identity/saml-metadata";

const sample = (name: string) => readFileSync(join(__dirname, "../../fixtures/saml", name), "utf8");

describe("EID SAML metadata", () => {
  it("reads an ADFS-shaped metadata file", () => {
    const r = parseIdpMetadata(sample("adfs-metadata.xml"));
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.value.entityId).toBe("http://sts.example.test/adfs/services/trust");
    expect(r.value.ssoUrl).toBe("https://sts.example.test/adfs/ls/");
    expect(r.value.certs).toHaveLength(1); // the signing key only, once
    expect(r.value.certExpiresAt[0]).toBe(new Date(new X509Certificate(r.value.certs[0]).validTo).toISOString());
  });

  it("reads an Okta-shaped metadata file and picks the redirect binding", () => {
    const r = parseIdpMetadata(sample("okta-metadata.xml"));
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.value.entityId).toBe("http://www.okta.example.test/exk0sample");
    expect(r.value.ssoUrl).toBe("https://example.okta.test/app/sample/exk0sample/sso/saml");
    expect(r.value.certs[0]).toMatch(/^-----BEGIN CERTIFICATE-----\n/);
  });

  it("refuses a DOCTYPE, more than 1 MB and metadata without what it needs", () => {
    const ok = sample("okta-metadata.xml");
    const doctype = ok.replace("<md:EntityDescriptor", '<!DOCTYPE x [<!ENTITY a "b">]><md:EntityDescriptor');
    expect(parseIdpMetadata(doctype).ok).toBe(false);
    expect(parseIdpMetadata(ok + " ".repeat(1_048_577)).ok).toBe(false);
    expect(parseIdpMetadata("<nope/>").ok).toBe(false);
    expect(parseIdpMetadata("not xml <<").ok).toBe(false);
    const noRedirect = ok.replace(/<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"[^>]*>/, "");
    expect(parseIdpMetadata(noRedirect)).toMatchObject({ ok: false });
    const noCert = ok.replace(/<md:KeyDescriptor[\s\S]*?<\/md:KeyDescriptor>/, "");
    expect(parseIdpMetadata(noCert)).toMatchObject({ ok: false });
  });

  it("names the entity ID and the ACS in the service provider metadata", () => {
    const xml = spMetadata({ entityId: "https://app.test/acme/login/saml/metadata", acsUrl: "https://app.test/acme/login/saml/acs" });
    expect(xml).toContain('entityID="https://app.test/acme/login/saml/metadata"');
    expect(xml).toContain('Location="https://app.test/acme/login/saml/acs"');
    expect(xml).toContain("HTTP-POST");
  });

  it("says ok, soon or expired", () => {
    const now = new Date("2026-11-04T00:00:00Z");
    expect(certStatus("2027-11-04T00:00:00Z", now)).toBe("ok");
    expect(certStatus("2026-12-04T00:00:00Z", now)).toBe("soon");
    expect(certStatus("2026-12-05T00:00:00Z", now)).toBe("ok");
    expect(certStatus("2026-11-03T00:00:00Z", now)).toBe("expired");
  });
});
