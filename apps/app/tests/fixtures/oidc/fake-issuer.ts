// A fake OpenID Connect issuer for tests (EID D18): node:http on 127.0.0.1, a random port and an RS256
// key made at start. Discovery, jwks, authorize (302 back with a code), token endpoint, and a switch for
// each attack. Used by tests/unit/eid/oidc.test.ts and tests/db/eid-oidc.test.ts.
import { createHash, createHmac, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

export type Attack = "wrong_issuer" | "wrong_audience" | "wrong_nonce" | "expired" | "hs256" | "unknown_kid";

export type FakeIssuerOptions = { clientId?: string; clientSecret?: string; kid?: string };
export type SignOptions = { alg?: "RS256" | "HS256" | "none"; kid?: string };

export type FakeIssuer = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Claims merged into the id_tokens of the token endpoint (sub, email, ...). */
  claims: Record<string, unknown>;
  /** The attack applied to id_tokens from the token endpoint, or null. */
  attack: Attack | null;
  /** The public key as a JWK, the way jwks serves it. */
  jwk: Record<string, unknown>;
  /** Requests seen, for assertions. */
  seen: { jwks: number; discovery: number; tokenAuth: string[]; verifierOk: boolean[] };
  sign(claims: Record<string, unknown>, opts?: SignOptions): string;
  stop(): Promise<void>;
};

const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startFakeIssuer(opts: FakeIssuerOptions = {}): Promise<FakeIssuer> {
  const clientId = opts.clientId ?? "fake-client";
  const clientSecret = opts.clientSecret ?? "fake-secret";
  const kid = opts.kid ?? "fake-key-1";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" } as Record<string, unknown>;
  const codes = new Map<string, { nonce: string; challenge: string }>();
  let issuer = "";

  const state: FakeIssuer = {
    get issuer() { return issuer; },
    clientId, clientSecret, claims: {}, attack: null, jwk,
    seen: { jwks: 0, discovery: 0, tokenAuth: [], verifierOk: [] },
    sign(claims, o = {}) {
      const now = Math.floor(Date.now() / 1000);
      const body = { iss: issuer, aud: clientId, iat: now, exp: now + 600, ...claims };
      const alg = o.alg ?? "RS256";
      const head = `${b64({ alg, typ: "JWT", ...(alg === "none" ? {} : { kid: o.kid ?? kid }) })}.${b64(body)}`;
      if (alg === "none") return `${head}.`;
      if (alg === "HS256") return `${head}.${createHmac("sha256", clientSecret).update(head).digest("base64url")}`;
      return `${head}.${createSign("sha256").update(head).sign(privateKey).toString("base64url")}`;
    },
    stop: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", issuer);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/.well-known/openid-configuration") {
      state.seen.discovery++;
      return json(200, {
        issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
      });
    }
    if (url.pathname === "/jwks") {
      state.seen.jwks++;
      return json(200, { keys: [jwk] });
    }
    if (url.pathname === "/authorize") {
      const code = randomBytes(12).toString("hex");
      codes.set(code, { nonce: url.searchParams.get("nonce") ?? "", challenge: url.searchParams.get("code_challenge") ?? "" });
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (url.pathname === "/token" && req.method === "POST") {
      const form = new URLSearchParams(await readBody(req));
      const basic = req.headers.authorization?.startsWith("Basic ")
        ? Buffer.from(req.headers.authorization.slice(6), "base64").toString("utf8").split(":")
        : null;
      const id = basic ? decodeURIComponent(basic[0]) : form.get("client_id");
      const secret = basic ? decodeURIComponent(basic[1] ?? "") : form.get("client_secret");
      state.seen.tokenAuth.push(basic ? "basic" : "post");
      if (id !== clientId || secret !== clientSecret) return json(401, { error: "invalid_client" });
      const issued = codes.get(form.get("code") ?? "");
      codes.delete(form.get("code") ?? "");
      if (!issued) return json(400, { error: "invalid_grant" });
      const verifierOk = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") === issued.challenge;
      state.seen.verifierOk.push(verifierOk);
      if (!verifierOk) return json(400, { error: "invalid_grant" });

      const now = Math.floor(Date.now() / 1000);
      const claims: Record<string, unknown> = { sub: "subject-1", nonce: issued.nonce, ...state.claims };
      const signOpts: SignOptions = {};
      switch (state.attack) {
        case "wrong_issuer": claims.iss = "https://evil.example"; break;
        case "wrong_audience": claims.aud = "someone-else"; break;
        case "wrong_nonce": claims.nonce = "not-the-nonce"; break;
        case "expired": claims.iat = now - 7200; claims.exp = now - 3600; break;
        case "hs256": signOpts.alg = "HS256"; break;
        case "unknown_kid": signOpts.kid = "other-key"; break;
      }
      return json(200, { access_token: "unused", token_type: "Bearer", id_token: state.sign(claims, signOpts) });
    }
    json(404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return state;
}
