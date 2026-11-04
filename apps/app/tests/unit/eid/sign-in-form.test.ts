import { describe, expect, it } from "vitest";
import {
  cardState, parseLogExportForm, parseOidcForm, parseSamlForm, samlSettingsFrom, type CardRow,
} from "../../../src/features/identity/sign-in-form";

const now = new Date("2026-11-04T10:00:00Z");
const day = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(now.getTime() + n * day).toISOString();

const oidc = { buttonText: "Acme login", issuer: "https://login.acme.test/realms/acme", clientId: "nextup", clientSecret: "s3cret" };
const idp = { entityId: "https://idp.test/e", ssoUrl: "https://idp.test/sso", certs: ["-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n"], certExpiresAt: [inDays(90)] };

describe("EID sign-in form", () => {
  it("accepts the OIDC card with its defaults and keeps the client secret out of the settings", () => {
    const r = parseOidcForm(oidc);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.value.settings).toMatchObject({ scopes: "openid email profile", tokenAuth: "client_secret_basic", emailClaim: "email" });
    expect(JSON.stringify(r.value.settings)).not.toContain("s3cret");
    expect(r.value.clientSecret).toBe("s3cret");
  });

  it("treats an empty client secret as 'keep the one we have'", () => {
    const r = parseOidcForm({ ...oidc, clientSecret: "   " });
    expect(r.ok && r.value.clientSecret).toBeNull();
  });

  it("refuses OIDC input that breaks D7: button text, https issuer, openid scope", () => {
    expect(parseOidcForm({ ...oidc, buttonText: "" }).ok).toBe(false);
    expect(parseOidcForm({ ...oidc, buttonText: "x".repeat(41) }).ok).toBe(false);
    expect(parseOidcForm({ ...oidc, issuer: "http://login.acme.test" }).ok).toBe(false);
    expect(parseOidcForm({ ...oidc, issuer: "ftp://login.acme.test" }).ok).toBe(false);
    expect(parseOidcForm({ ...oidc, scopes: "email profile" }).ok).toBe(false);
    expect(parseOidcForm({ ...oidc, clientId: "" }).ok).toBe(false);
  });

  it("parses the SAML card by metadata source and refuses an oversized or missing one", () => {
    const base = { buttonText: "Acme SSO" };
    expect(parseSamlForm({ ...base, source: "url", metadataUrl: "https://idp.test/m" })).toMatchObject({ ok: true, value: { source: { kind: "url" } } });
    expect(parseSamlForm({ ...base, source: "file", metadataXml: "<x/>" })).toMatchObject({ ok: true, value: { source: { kind: "file" } } });
    expect(parseSamlForm({ ...base })).toMatchObject({ ok: true, value: { source: { kind: "keep" } } });
    expect(parseSamlForm({ ...base, source: "url", metadataUrl: "" }).ok).toBe(false);
    expect(parseSamlForm({ ...base, source: "file", metadataXml: "x".repeat(1_048_577) }).ok).toBe(false);
    expect(parseSamlForm({ buttonText: "", source: "keep" }).ok).toBe(false);
  });

  it("builds the SAML settings from the metadata and refuses a non-https sign-on address", () => {
    const form = parseSamlForm({ buttonText: "Acme SSO", source: "keep" });
    if (!form.ok) throw new Error("form");
    const ok = samlSettingsFrom(form.value, idp, "https://idp.test/m");
    expect(ok).toMatchObject({ ok: true, value: { idpEntityId: "https://idp.test/e", metadataUrl: "https://idp.test/m" } });
    expect(samlSettingsFrom(form.value, { ...idp, ssoUrl: "http://idp.test/sso" }, null).ok).toBe(false);
  });

  it("validates the log export: syslog needs host and a port of 1-65535, a file needs neither", () => {
    expect(parseLogExportForm({ target: "syslog", host: "siem.acme.local", port: "6514", transport: "tls" })).toMatchObject({ ok: true, value: { transport: "tls", port: 6514 } });
    expect(parseLogExportForm({ target: "syslog", host: "siem.acme.local", port: "0" }).ok).toBe(false);
    expect(parseLogExportForm({ target: "syslog", host: "siem.acme.local", port: "65536" }).ok).toBe(false);
    expect(parseLogExportForm({ target: "syslog", host: "siem.acme.local", port: "abc" }).ok).toBe(false);
    expect(parseLogExportForm({ target: "syslog", host: "", port: "514" }).ok).toBe(false);
    expect(parseLogExportForm({ target: "syslog", host: "h", port: "" }).ok).toBe(false);
    expect(parseLogExportForm({ target: "file", host: "ignored", port: "1" })).toMatchObject({ ok: true, value: { target: "file", host: null, port: null, transport: null } });
    expect(parseLogExportForm({ target: "tape" }).ok).toBe(false);
  });

  describe("card states", () => {
    const row = (over: Partial<CardRow> = {}): CardRow => ({ on: true, settings: {}, account: null, lastError: null, ...over });
    const saml = (expires: string[]) => ({
      buttonText: "S", idpEntityId: "e", ssoUrl: "https://idp.test/sso", idpCerts: idp.certs, certExpiresAt: expires,
    });
    const extra = (kind: "oidc" | "saml" | "scim" | "logsink", demo = false) => ({ kind, demo });

    it("is off without a row or with the switch off", () => {
      expect(cardState(null, extra("oidc"), now)).toBe("off");
      expect(cardState(row({ on: false }), extra("scim"), now)).toBe("off");
    });

    it("is on when it is on and nothing is wrong", () => {
      expect(cardState(row(), extra("oidc"), now)).toBe("on");
      expect(cardState(row({ settings: saml([inDays(31)]) }), extra("saml"), now)).toBe("on");
    });

    it("needs you when the SAML certificate expires in 30 days or less, error once it has expired", () => {
      expect(cardState(row({ settings: saml([inDays(30)]) }), extra("saml"), now)).toBe("needsYou");
      expect(cardState(row({ settings: saml([inDays(5), inDays(200)]) }), extra("saml"), now)).toBe("needsYou");
      expect(cardState(row({ settings: saml([inDays(-1)]) }), extra("saml"), now)).toBe("error");
    });

    it("is an error when the last test failed or the last round failed", () => {
      const failed = { lastTest: { at: now.toISOString(), ok: false, detail: "failed" } };
      expect(cardState(row({ account: failed }), extra("oidc"), now)).toBe("error");
      expect(cardState(row({ account: { lastTest: { at: now.toISOString(), ok: true, detail: "u1" } } }), extra("oidc"), now)).toBe("on");
      expect(cardState(row({ lastError: "connection refused" }), extra("logsink"), now)).toBe("error");
    });

    it("is read-only for a demo company on OIDC, SAML and SCIM, never on the log export", () => {
      for (const kind of ["oidc", "saml", "scim"] as const) expect(cardState(row(), extra(kind, true), now)).toBe("demo");
      expect(cardState(row(), extra("logsink", true), now)).toBe("on");
      expect(cardState(null, extra("logsink", true), now)).toBe("off");
    });
  });
});
