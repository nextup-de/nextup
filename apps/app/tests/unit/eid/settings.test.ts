import { describe, expect, it } from "vitest";
import { allowedUrl, parseLogExportSettings, parseOidcSettings, parseSamlSettings, parseScimSettings } from "@/features/identity/settings";
import { checkToken, OFFERED_SCOPES } from "@/features/api/token-form";
import { SCIM_SCOPE, SCOPES } from "@/features/integrations";

const CERT = "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----";
const oidc = { buttonText: "Sign in with Acme", issuer: "https://login.acme.example", clientId: "abc" };
const saml = { buttonText: "Acme SSO", idpEntityId: "https://idp.acme.example", ssoUrl: "https://idp.acme.example/sso", idpCerts: [CERT] };

describe("EID settings", () => {
  it("fills the defaults of OIDC", () => {
    const r = parseOidcSettings(oidc);
    expect(r).toEqual({ ok: true, value: { ...oidc, scopes: "openid email profile", tokenAuth: "client_secret_basic", emailClaim: "email", nameClaim: "name", departmentClaim: null } });
  });

  it("refuses a non-https issuer, an empty button and scopes without openid", () => {
    expect(parseOidcSettings({ ...oidc, issuer: "http://login.acme.example" }).ok).toBe(false);
    expect(parseOidcSettings({ ...oidc, issuer: "http://127.0.0.1:9999" }).ok).toBe(true); // VITEST is set: the fakes
    expect(parseOidcSettings({ ...oidc, buttonText: "" }).ok).toBe(false);
    expect(parseOidcSettings({ ...oidc, scopes: "email profile" }).ok).toBe(false);
    expect(parseOidcSettings({ ...oidc, scopes: "openidx email" }).ok).toBe(false);
  });

  it("allows plain http only for the local fakes under test", () => {
    expect(allowedUrl("http://localhost:3000", { VITEST: "true" })).toBe(true);
    expect(allowedUrl("http://localhost:3000", {})).toBe(false);
    expect(allowedUrl("http://localhost", { VITEST: "true" })).toBe(false);
    expect(allowedUrl("http://example.com:80", { VITEST: "true" })).toBe(false);
    expect(allowedUrl("https://user:pw@idp.example", {})).toBe(false);
    expect(allowedUrl("not a url", {})).toBe(false);
  });

  it("fills the defaults of SAML and refuses a setting without certificates", () => {
    const r = parseSamlSettings(saml);
    expect(r.ok && r.value.emailAttribute).toBe("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress");
    expect(r.ok && r.value.metadataUrl).toBeNull();
    expect(parseSamlSettings({ ...saml, idpCerts: [] }).ok).toBe(false);
    expect(parseSamlSettings({ ...saml, idpCerts: undefined }).ok).toBe(false);
    expect(parseSamlSettings({ ...saml, idpCerts: [CERT, CERT, CERT, CERT] }).ok).toBe(false);
    expect(parseSamlSettings({ ...saml, idpCerts: ["not a pem"] }).ok).toBe(false);
    expect(parseSamlSettings({ ...saml, ssoUrl: "http://idp.acme.example/sso" }).ok).toBe(false);
    expect(parseSamlSettings({ ...saml, metadataUrl: "http://idp.acme.example/m" }).ok).toBe(false);
  });

  it("needs a token id for SCIM", () => {
    expect(parseScimSettings({ tokenId: "t1" })).toEqual({ ok: true, value: { tokenId: "t1" } });
    expect(parseScimSettings({}).ok).toBe(false);
  });

  it("checks the log export: syslog needs host and a port in range, file needs neither", () => {
    const r = parseLogExportSettings({ target: "syslog", host: "logs.acme.example", port: 6514 });
    expect(r).toEqual({ ok: true, value: { target: "syslog", host: "logs.acme.example", port: 6514, transport: "tls", caPem: null, appName: "nextup" } });
    expect(parseLogExportSettings({ target: "syslog", host: "h", port: 0 }).ok).toBe(false);
    expect(parseLogExportSettings({ target: "syslog", host: "h", port: 65536 }).ok).toBe(false);
    expect(parseLogExportSettings({ target: "syslog", host: "h", port: 1.5 }).ok).toBe(false);
    expect(parseLogExportSettings({ target: "syslog", port: 514 }).ok).toBe(false);
    expect(parseLogExportSettings({ target: "syslog", host: "h", port: 514, transport: "smtp" }).ok).toBe(false);
    const f = parseLogExportSettings({ target: "file", host: "ignored", port: 514 });
    expect(f.ok && f.value).toMatchObject({ target: "file", host: null, port: null, transport: null });
  });

  it("does not offer scim on the API tokens page and refuses it there", () => {
    expect(SCOPES).toContain(SCIM_SCOPE);
    expect(OFFERED_SCOPES).not.toContain("scim");
    expect(checkToken({ name: "t", scopes: ["scim"] }, []).ok).toBe(false);
    expect(checkToken({ name: "t", scopes: ["cases:read"] }, []).ok).toBe(true);
  });
});
