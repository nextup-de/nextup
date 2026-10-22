// "Continue with Microsoft" (src/features/auth/entra.ts). The point of these: a token from another
// tenant, for another app, with a stale nonce or long expired is refused; the flow cookie cannot
// be forged or outlive its ten minutes; nothing untrusted ends up in the authorize URL's path.
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  checkIdToken,
  decodeIdToken,
  entraApp,
  idTokenKeyId,
  isMicrosoftError,
  isTenantId,
  jwksUrl,
  pkcePair,
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
    expect(r).toEqual({ ok: true, who: { oid: "oid-1", tid: TID, email: "j.schmidt@acme.example", name: "J. Schmidt" } });
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
