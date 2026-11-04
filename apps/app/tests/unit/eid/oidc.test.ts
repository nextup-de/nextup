import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorizeUrlFor, checkOidcJwt, parseDiscovery, tokenRequest } from "../../../src/features/identity/oidc";
import { startFakeIssuer, type FakeIssuer } from "../../fixtures/oidc/fake-issuer";

describe("EID OIDC token", () => {
  let idp: FakeIssuer;
  const nonce = "n-0123456789abcdef";
  const now = Math.floor(Date.now() / 1000);
  const want = () => ({ issuer: idp.issuer, clientId: idp.clientId, nonce, now, emailClaim: "email", nameClaim: "name", departmentClaim: "dept" });
  const keys = () => [idp.jwk as { kid: string; kty: string; n: string; e: string }];
  const good = (extra: Record<string, unknown> = {}) => ({ sub: "s-1", nonce, email: "Ann@A.test", name: "Ann", dept: "Ops", ...extra });
  const check = (jwt: string) => checkOidcJwt(jwt, keys(), want());

  beforeAll(async () => { idp = await startFakeIssuer(); });
  afterAll(async () => { await idp.stop(); });

  it("accepts a good RS256 token and maps the claims", () => {
    const r = check(idp.sign(good()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claims).toMatchObject({
      issuer: idp.issuer, subject: "s-1", email: "ann@a.test", displayName: "Ann", department: "Ops", externalIds: {},
    });
  });

  it("accepts an audience list that contains the client id when azp is the client id", () => {
    expect(check(idp.sign(good({ aud: [idp.clientId, "other"], azp: idp.clientId }))).ok).toBe(true);
  });

  it("refuses a wrong issuer, audience, azp and nonce", () => {
    expect(check(idp.sign(good({ iss: "https://evil.example" }))).ok).toBe(false);
    expect(check(idp.sign(good({ aud: "someone-else" }))).ok).toBe(false);
    expect(check(idp.sign(good({ aud: [idp.clientId, "other"] }))).ok).toBe(false); // several values, no azp
    expect(check(idp.sign(good({ aud: [idp.clientId, "other"], azp: "other" }))).ok).toBe(false);
    expect(check(idp.sign(good({ nonce: "something-else" }))).ok).toBe(false);
  });

  it("refuses an expired token but allows 300 s of skew", () => {
    const old = check(idp.sign(good({ iat: now - 7200, exp: now - 3600 })));
    expect(old).toEqual({ ok: false, reason: "expired" });
    expect(check(idp.sign(good({ iat: now - 700, exp: now - 100 }))).ok).toBe(true);
  });

  it("refuses HS256, alg none, an unknown key and a tampered payload", () => {
    expect(check(idp.sign(good(), { alg: "HS256" })).ok).toBe(false);
    expect(check(idp.sign(good(), { alg: "none" })).ok).toBe(false);
    expect(check(idp.sign(good(), { kid: "other-key" })).ok).toBe(false);
    const [h, , s] = idp.sign(good()).split(".");
    const forged = Buffer.from(JSON.stringify({ ...good(), iss: idp.issuer, aud: idp.clientId, iat: now, exp: now + 600, sub: "admin" })).toString("base64url");
    expect(check(`${h}.${forged}.${s}`).ok).toBe(false);
  });

  it("refuses email_verified false", () => {
    expect(check(idp.sign(good({ email_verified: false })))).toEqual({ ok: false, reason: "email_unverified" });
    expect(check(idp.sign(good({ email_verified: true }))).ok).toBe(true);
  });

  it("falls back for a missing name and email", () => {
    const r = check(idp.sign({ sub: "s-9", nonce }));
    expect(r.ok && r.claims.email).toBeNull();
    expect(r.ok && r.claims.displayName).toBe("s-9");
  });

  it("parses discovery only for the exact issuer with all three endpoints", () => {
    const doc = { issuer: idp.issuer, authorization_endpoint: `${idp.issuer}/a`, token_endpoint: `${idp.issuer}/t`, jwks_uri: `${idp.issuer}/j` };
    expect(parseDiscovery(doc, idp.issuer)).toEqual({ authorizationEndpoint: `${idp.issuer}/a`, tokenEndpoint: `${idp.issuer}/t`, jwksUri: `${idp.issuer}/j` });
    expect(parseDiscovery({ ...doc, issuer: `${idp.issuer}/` }, idp.issuer)).toBeNull();
    expect(parseDiscovery({ ...doc, jwks_uri: undefined }, idp.issuer)).toBeNull();
    expect(parseDiscovery({ ...doc, token_endpoint: "http://evil.example/t" }, idp.issuer)).toBeNull();
    expect(parseDiscovery(null, idp.issuer)).toBeNull();
  });

  it("builds the authorize URL with PKCE and both token auth modes", () => {
    const u = new URL(authorizeUrlFor({
      discovery: { authorizationEndpoint: "https://idp.example/auth", tokenEndpoint: "https://idp.example/t", jwksUri: "https://idp.example/j" },
      clientId: "c", redirectUri: "https://app.example/cb", scopes: "openid email", state: "st", nonce: "no", challenge: "ch",
    }));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      response_type: "code", client_id: "c", code_challenge: "ch", code_challenge_method: "S256", scope: "openid email", state: "st", nonce: "no",
    });
    const base = { clientId: "c d", clientSecret: "s:ecret", code: "x", redirectUri: "https://app.example/cb", verifier: "v" };
    const basic = tokenRequest({ ...base, tokenAuth: "client_secret_basic" });
    expect(basic.headers.authorization).toBe(`Basic ${Buffer.from("c+d:s%3Aecret").toString("base64")}`);
    expect(basic.body).not.toContain("client_secret");
    const post = tokenRequest({ ...base, tokenAuth: "client_secret_post" });
    expect(post.headers.authorization).toBeUndefined();
    expect(new URLSearchParams(post.body).get("client_secret")).toBe("s:ecret");
  });
});
