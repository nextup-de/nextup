// "Continue with Microsoft" (src/features/auth/entra.ts). The point of these: a token from another
// tenant, for another app, with a stale nonce or long expired is refused; the flow cookie cannot
// be forged or outlive its ten minutes; nothing untrusted ends up in the authorize URL's path.
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  canSearchFiles,
  checkIdToken,
  decodeIdToken,
  entraApp,
  grantedScopes,
  idTokenKeyId,
  isMicrosoftError,
  isEntraAdmin,
  isTenantId,
  landingFor,
  M365_SCOPE,
  SIGN_IN_SCOPE,
  jwksUrl,
  pkcePair,
  roleFromEntra,
  signFlow,
  tokenRequestBody,
  verifyFlow,
  verifyIdTokenSignature,
  type Jwk,
  type Flow,
} from "@/features/auth/entra";

const TID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const want = { clientId: "app-1", tenantId: TID, nonce: "n-123" };
const now = 1_800_000_000;

const claims = (over: Record<string, unknown> = {}) => ({
  aud: "app-1",
  tid: TID,
  iss: `https://login.microsoftonline.com/${TID}/v2.0`,
  nonce: "n-123",
  exp: now + 3600,
  oid: "oid-1",
  preferred_username: "J.Schmidt@Acme.example",
  name: "J. Schmidt",
  ...over,
});

const jwt = (payload: object) =>
  ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

describe("entra config", () => {
  it("is off unless both id and secret are set", () => {
    expect(entraApp({})).toBeNull();
    expect(entraApp({ ENTRA_CLIENT_ID: "a" })).toBeNull();
    expect(entraApp({ ENTRA_CLIENT_ID: "a", ENTRA_CLIENT_SECRET: " s " })).toEqual({ clientId: "a", clientSecret: "s" });
  });

  it("accepts only GUID tenant ids", () => {
    expect(isTenantId(TID)).toBe(true);
    expect(isTenantId(TID.toUpperCase())).toBe(true);
    expect(isTenantId("common")).toBe(false);
    expect(isTenantId("evil.example/x")).toBe(false);
    expect(isTenantId(null)).toBe(false);
  });
});

describe("authorize request", () => {
  it("goes to the company's tenant with PKCE, state and nonce", () => {
    const { verifier, challenge } = pkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    const u = new URL(authorizeUrl({ tenantId: TID, clientId: "app-1", redirectUri: "https://x/acme/login/microsoft/callback", state: "s", nonce: "n", challenge }));
    expect(u.origin + u.pathname).toBe(`https://login.microsoftonline.com/${TID}/oauth2/v2.0/authorize`);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(challenge);
    expect(u.searchParams.get("state")).toBe("s");
    expect(u.searchParams.get("nonce")).toBe("n");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x/acme/login/microsoft/callback");
  });

  it("sends the verifier, not the challenge, to the token endpoint", () => {
    const body = tokenRequestBody({ clientId: "a", clientSecret: "s", code: "c", redirectUri: "r", verifier: "v" });
    expect(body.get("code_verifier")).toBe("v");
    expect(body.get("grant_type")).toBe("authorization_code");
  });
});

describe("flow cookie", () => {
  const flow: Flow = { slug: "acme", state: "s", nonce: "n", verifier: "v", next: "/", exp: now + 600 };

  it("round-trips", () => {
    expect(verifyFlow(signFlow(flow, "k"), "k", now)).toEqual(flow);
  });

  it("refuses a wrong secret, a tampered payload, and an expired flow", () => {
    const raw = signFlow(flow, "k");
    expect(verifyFlow(raw, "other", now)).toBeNull();
    const forged = Buffer.from(JSON.stringify({ ...flow, slug: "globex" })).toString("base64url");
    expect(verifyFlow(`${forged}.${raw.split(".")[1]}`, "k", now)).toBeNull();
    expect(verifyFlow(raw, "k", now + 601)).toBeNull();
    expect(verifyFlow(undefined, "k", now)).toBeNull();
    expect(verifyFlow("garbage", "k", now)).toBeNull();
  });
});

describe("id token", () => {
  it("accepts a matching token and matches on the lower-cased sign-in name", () => {
    const r = checkIdToken(decodeIdToken(jwt(claims())), want, now);
    expect(r).toEqual({ ok: true, who: { oid: "oid-1", tid: TID, email: "j.schmidt@acme.example", name: "J. Schmidt", roles: [] } });
  });

  it("prefers the email claim when there is one", () => {
    const r = checkIdToken(claims({ email: "js@acme.example" }), want, now);
    expect(r.ok && r.who.email).toBe("js@acme.example");
  });

  it("refuses another tenant", () => {
    expect(checkIdToken(claims({ tid: OTHER }), want, now)).toEqual({ ok: false, reason: "tenant" });
    expect(checkIdToken(claims({ iss: `https://login.microsoftonline.com/${OTHER}/v2.0` }), want, now)).toEqual({ ok: false, reason: "tenant" });
  });

  it("refuses another app, another nonce, no oid", () => {
    expect(checkIdToken(claims({ aud: "app-2" }), want, now).ok).toBe(false);
    expect(checkIdToken(claims({ nonce: "n-999" }), want, now).ok).toBe(false);
    expect(checkIdToken(claims({ oid: undefined }), want, now).ok).toBe(false);
  });

  it("refuses an expired token, tolerating a little clock skew", () => {
    expect(checkIdToken(claims({ exp: now - 60 }), want, now).ok).toBe(true);
    expect(checkIdToken(claims({ exp: now - 3600 }), want, now)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses what is not a JWT", () => {
    expect(decodeIdToken("a.b")).toBeNull();
    expect(decodeIdToken(42)).toBeNull();
    expect(checkIdToken(null, want, now)).toEqual({ ok: false, reason: "token" });
  });

  it("knows its own error keys only", () => {
    expect(isMicrosoftError("tenant")).toBe(true);
    expect(isMicrosoftError("toString")).toBe(false);
    expect(isMicrosoftError("<script>")).toBe(false);
  });
});

// The signature check: a token is only good when one of the tenant's published keys signed it.
describe("ID token signature", () => {
  const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString("base64url");
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwkOf = (k: typeof pair, kid: string): Jwk => ({ ...(k.publicKey.export({ format: "jwk" }) as Jwk), kid, use: "sig" });
  const sign = (payload: object, header: object, key = pair.privateKey) => {
    const head = b64(header);
    const body = b64(payload);
    return `${head}.${body}.${b64(cryptoSign("sha256", Buffer.from(`${head}.${body}`), key))}`;
  };
  const keys = [jwkOf(pair, "k1")];

  it("accepts a token signed by a published key", () => {
    const t = sign(claims(), { alg: "RS256", kid: "k1" });
    expect(verifyIdTokenSignature(t, keys)).toBe(true);
  });

  it("refuses a token signed by another key", () => {
    const t = sign(claims(), { alg: "RS256", kid: "k1" }, other.privateKey);
    expect(verifyIdTokenSignature(t, keys)).toBe(false);
  });

  it("refuses a changed payload", () => {
    const t = sign(claims(), { alg: "RS256", kid: "k1" });
    const [h, , s] = t.split(".");
    expect(verifyIdTokenSignature(`${h}.${b64(claims({ oid: "someone-else" }))}.${s}`, keys)).toBe(false);
  });

  it("refuses an unknown key id", () => {
    expect(verifyIdTokenSignature(sign(claims(), { alg: "RS256", kid: "k9" }), keys)).toBe(false);
  });

  it("refuses any algorithm but RS256", () => {
    expect(verifyIdTokenSignature(sign(claims(), { alg: "none", kid: "k1" }), keys)).toBe(false);
    expect(verifyIdTokenSignature(`${b64({ alg: "HS256", kid: "k1" })}.${b64(claims())}.x`, keys)).toBe(false);
    expect(idTokenKeyId(sign(claims(), { alg: "none", kid: "k1" }))).toBeNull();
  });

  it("refuses garbage and keys without a modulus", () => {
    expect(verifyIdTokenSignature("a.b", keys)).toBe(false);
    expect(verifyIdTokenSignature(42, keys)).toBe(false);
    expect(verifyIdTokenSignature(sign(claims(), { alg: "RS256", kid: "k1" }), [{ kid: "k1", kty: "RSA" }])).toBe(false);
  });

  it("points at the tenant's own key set", () => {
    expect(jwksUrl(TID)).toBe(`https://login.microsoftonline.com/${TID}/discovery/v2.0/keys`);
  });
});

// Roles from Entra: the customer's IT assigns an app role, the token carries it, and it sets the
// person's role and - for someone new - is the only reason an account gets created.
describe("roles from Entra", () => {
  it("reads the roles claim and ignores what is not a string", () => {
    const r = checkIdToken(claims({ roles: ["NextUp.Leader", 7, null] }), want, now);
    expect(r.ok && r.who.roles).toEqual(["NextUp.Leader"]);
    expect(checkIdToken(claims({ roles: "NextUp.Leader" }), want, now)).toMatchObject({ ok: true, who: { roles: [] } });
  });

  it("maps the three app roles, whatever their case", () => {
    expect(roleFromEntra(["NextUp.Manager"])).toBe("manager");
    expect(roleFromEntra([" nextup.LEADER "])).toBe("leader");
    expect(roleFromEntra(["NextUp.Member"])).toBe("member");
  });

  it("gives the most powerful role when several are assigned", () => {
    expect(roleFromEntra(["NextUp.Member", "NextUp.Leader"])).toBe("leader");
    expect(roleFromEntra(["NextUp.Member", "NextUp.Manager", "NextUp.Leader"])).toBe("manager");
  });

  it("knows no role from anything else", () => {
    expect(roleFromEntra([])).toBeNull();
    expect(roleFromEntra(["Admin", "manager", "NextUp.Owner", "NextUp.Admin"])).toBeNull();
    expect(roleFromEntra(["toString", "__proto__", "constructor"])).toBeNull();
  });

  const email = "new.person@acme.example";

  it("lets a known person in and keeps their role when Entra assigns none", () => {
    expect(landingFor({ found: { role: "leader" }, emailTaken: false, email, role: null })).toEqual({ kind: "existing", setRole: null });
  });

  it("takes the role Entra assigns over the stored one", () => {
    expect(landingFor({ found: { role: "member" }, emailTaken: false, email, role: "leader" })).toEqual({ kind: "existing", setRole: "leader" });
    expect(landingFor({ found: { role: "leader" }, emailTaken: false, email, role: "leader" })).toEqual({ kind: "existing", setRole: null });
  });

  it("creates a new person only when Entra assigned a role", () => {
    expect(landingFor({ found: null, emailTaken: false, email, role: "member" })).toEqual({ kind: "create", role: "member" });
    expect(landingFor({ found: null, emailTaken: false, email, role: null })).toEqual({ kind: "refuse", reason: "norole" });
  });

  it("never creates a second account for an email somebody else here already uses", () => {
    expect(landingFor({ found: null, emailTaken: true, email, role: "manager" })).toEqual({ kind: "refuse", reason: "unknown" });
  });

  it("needs an email to create someone", () => {
    expect(landingFor({ found: null, emailTaken: false, email: "", role: "member" })).toEqual({ kind: "refuse", reason: "unknown" });
  });

  it("has a message for the no-role case", () => {
    expect(isMicrosoftError("norole")).toBe(true);
  });
});

// /admin with Microsoft: the NextUp.Admin app role is the only key, and it is not a NextUp role.
describe("Microsoft sign-in to /admin", () => {
  it("opens for NextUp.Admin, whatever its case", () => {
    expect(isEntraAdmin(["NextUp.Admin"])).toBe(true);
    expect(isEntraAdmin(["NextUp.Member", " nextup.ADMIN "])).toBe(true);
  });

  it("stays shut for every other role, including a manager", () => {
    expect(isEntraAdmin([])).toBe(false);
    expect(isEntraAdmin(["NextUp.Manager", "NextUp.Leader", "NextUp.Member", "Admin", "NextUp.Administrator"])).toBe(false);
  });

  it("gives NextUp.Admin no place in the person roles", () => {
    expect(roleFromEntra(["NextUp.Admin"])).toBeNull();
  });

  it("carries the admin intent in the signed flow cookie, and nothing else", () => {
    const base: Flow = { slug: "acme", state: "s", nonce: "n", verifier: "v", next: "/", exp: now + 600 };
    expect(verifyFlow(signFlow({ ...base, as: "admin" }, "k"), "k", now)?.as).toBe("admin");
    expect(verifyFlow(signFlow(base, "k"), "k", now)?.as).toBeUndefined();
    expect(verifyFlow(signFlow({ ...base, as: "root" as "admin" }, "k"), "k", now)).toBeNull();
  });

  it("has a message for a Microsoft account that is not an administrator", () => {
    expect(isMicrosoftError("noadmin")).toBe(true);
  });
});

// "Connect Microsoft 365" (phase 2): the same flow, asking for the person's files and a refresh token.
describe("Connect Microsoft 365", () => {
  const base = { tenantId: TID, clientId: "app-1", redirectUri: "https://x/acme/login/microsoft/callback", state: "s", nonce: "n", challenge: "c" };

  it("signs in with the identity scopes only", () => {
    expect(new URL(authorizeUrl(base)).searchParams.get("scope")).toBe(SIGN_IN_SCOPE);
    expect(SIGN_IN_SCOPE).not.toMatch(/offline_access|Files|Mail|Sites|Chat|Calendars/);
  });

  it("asks for files and a refresh token, and nothing else, when connecting", () => {
    const scope = new URL(authorizeUrl({ ...base, scope: M365_SCOPE })).searchParams.get("scope")!;
    expect(scope.split(" ").sort()).toEqual(["email", "https://graph.microsoft.com/Files.Read.All", "offline_access", "openid", "profile"]);
    expect(tokenRequestBody({ clientId: "a", clientSecret: "b", code: "c", redirectUri: "r", verifier: "v", scope: M365_SCOPE }).get("scope")).toBe(M365_SCOPE);
  });

  it("reads the granted scopes without the Graph prefix", () => {
    expect(grantedScopes("https://graph.microsoft.com/Files.Read.All https://graph.microsoft.com/User.Read openid offline_access openid"))
      .toEqual(["Files.Read.All", "User.Read", "offline_access", "openid"]);
    expect(grantedScopes(undefined)).toEqual([]);
    expect(grantedScopes(42)).toEqual([]);
  });

  it("needs both the files and offline access to search later", () => {
    expect(canSearchFiles(["Files.Read.All", "offline_access"])).toBe(true);
    expect(canSearchFiles(["files.read.all", "OFFLINE_ACCESS"])).toBe(true);
    expect(canSearchFiles(["Files.Read.All"])).toBe(false);
    expect(canSearchFiles(["offline_access", "Files.Read"])).toBe(false);
    expect(canSearchFiles([])).toBe(false);
  });

  it("carries the connect purpose in the signed flow cookie", () => {
    const f: Flow = { slug: "acme", state: "s", nonce: "n", verifier: "v", next: "", exp: now + 600, as: "connect" };
    expect(verifyFlow(signFlow(f, "k"), "k", now)?.as).toBe("connect");
  });
});
