// A small fake of the Bot Framework for the Teams tests (TMS D17). node:http and node:crypto only, and no
// imports from src/, like tests/fake-jira/.
//
// It serves what the bot talks to:
//  - the OpenID document (issuer https://api.botframework.com, jwks_uri) and the JWKS with one RSA key;
//  - the token endpoint (client credentials: checks client id and secret, answers access_token and expires_in);
//  - POST /v3/conversations/:id/activities: records the activity, answers 200 { id } or the status from failNext.
// `mintToken` signs an inbound RS256 JWT the way the Bot Framework does, with valid defaults any claim can override.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createSign, generateKeyPairSync } from "node:crypto";
import type { KeyObject } from "node:crypto";

export type FakeBotOptions = {
  appId?: string;
  /** The client secret the token endpoint accepts. */
  password?: string;
  /** Seconds an app token lives (expires_in). Default 3600. */
  tokenLifetime?: number;
};

export type RecordedActivity = { conversationId: string; activity: unknown; authorization: string | undefined };

type KeyPair = { kid: string; privateKey: KeyObject; jwk: Record<string, unknown> };

const makeKey = (kid: string): KeyPair => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" } };
};

const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

export type FakeBotFramework = Awaited<ReturnType<typeof startFakeBotFramework>>;

export async function startFakeBotFramework(opts: FakeBotOptions = {}) {
  const appId = opts.appId ?? "00000000-0000-4000-8000-00000000b0b0";
  const password = opts.password ?? "fake-secret";
  const tokenLifetime = opts.tokenLifetime ?? 3600;
  const key = makeKey("fake-bf-key-1");
  const otherKey = makeKey("fake-bf-key-other");

  const activities: RecordedActivity[] = [];
  const counts = { openId: 0, jwks: 0, token: 0 };
  let failStatus: number | null = null;
  let nextId = 1;
  let nextToken = 1;
  let base = "";

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => resolve(s)); });

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const raw = await readBody(req);
    const method = req.method ?? "GET";
    let m: RegExpExecArray | null;

    if (method === "GET" && url.pathname === "/openid") {
      counts.openId++;
      return json(res, 200, {
        issuer: "https://api.botframework.com",
        jwks_uri: `${base}/keys`,
        id_token_signing_alg_values_supported: ["RS256"],
      });
    }
    if (method === "GET" && url.pathname === "/keys") {
      counts.jwks++;
      return json(res, 200, { keys: [key.jwk] });
    }
    if (method === "POST" && url.pathname === "/token") {
      counts.token++;
      const form = new URLSearchParams(raw);
      if (form.get("grant_type") !== "client_credentials") return json(res, 400, { error: "unsupported_grant_type" });
      if (form.get("client_id") !== appId || form.get("client_secret") !== password) {
        return json(res, 401, { error: "invalid_client" });
      }
      return json(res, 200, { token_type: "Bearer", access_token: `fake-app-token-${nextToken++}`, expires_in: tokenLifetime });
    }
    if (method === "POST" && (m = /^\/v3\/conversations\/([^/]+)\/activities$/.exec(url.pathname))) {
      let activity: unknown;
      try { activity = JSON.parse(raw); } catch { activity = raw; }
      activities.push({ conversationId: decodeURIComponent(m[1]), activity, authorization: req.headers.authorization });
      if (failStatus !== null) {
        const status = failStatus;
        failStatus = null;
        return json(res, status, { error: { code: "Fake", message: `failNext ${status}` } });
      }
      return json(res, 200, { id: `fake-activity-${nextId++}` });
    }
    return json(res, 404, { error: "no such endpoint" });
  };

  const server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

  const sign = (claims: Record<string, unknown>, pair: KeyPair, header: Record<string, unknown> = {}) => {
    const head = b64({ alg: "RS256", typ: "JWT", kid: pair.kid, ...header });
    const body = b64(claims);
    const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(pair.privateKey).toString("base64url");
    return `${head}.${body}.${sig}`;
  };
  const validClaims = (): Record<string, unknown> => {
    const now = Math.floor(Date.now() / 1000);
    return { iss: "https://api.botframework.com", aud: appId, serviceurl: base + "/", nbf: now - 60, iat: now - 60, exp: now + 3600 };
  };

  return {
    appId,
    password,
    openIdUrl: `${base}/openid`,
    tokenUrl: `${base}/token`,
    serviceUrl: base + "/",
    activities,
    /** How often each endpoint was hit (openId, jwks, token). */
    counts,
    /** A signed inbound JWT. Defaults are valid; any claim can be overridden (undefined removes it). */
    mintToken(claims: Record<string, unknown> = {}): string {
      const all = { ...validClaims(), ...claims };
      for (const k of Object.keys(all)) if (all[k] === undefined) delete all[k];
      return sign(all, key);
    },
    /** Valid claims signed by a key the JWKS does not publish (its own kid). */
    mintWithOtherKey(claims: Record<string, unknown> = {}): string {
      return sign({ ...validClaims(), ...claims }, otherKey);
    },
    /** A token with the right kid but another algorithm in the header (HS256 or none). */
    mintWithAlg(alg: string, claims: Record<string, unknown> = {}): string {
      const head = b64({ alg, typ: "JWT", kid: key.kid });
      const body = b64({ ...validClaims(), ...claims });
      return alg === "none" ? `${head}.${body}.` : `${head}.${body}.${Buffer.from("not-a-real-mac").toString("base64url")}`;
    },
    /** The next activity post answers this status. */
    failNext(status: number) { failStatus = status; },
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
