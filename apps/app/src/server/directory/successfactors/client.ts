// SuccessFactors OData v2 client (plan SFX, D3/D5/D6). Read-only: GET plus the POST to /oauth/token.
// The token is requested with a self-signed SAML bearer assertion and cached in memory until five minutes
// before it expires. Errors read '<what> failed: <status>' - no body, token, key or assertion.
import { randomUUID } from "node:crypto";
import type { SuccessFactorsSettings } from "@/features/directory/successfactors-settings";
import { buildAssertion, signAssertion } from "./assertion";

const GRANT = "urn:ietf:params:oauth:grant-type:saml2-bearer";
const EARLY_MS = 5 * 60_000;
const PAGE = 500;
const TIMEOUT_MS = 30_000;
const MAX_WAIT_S = 30;
const RETRIES = 2;
const MAX_PAGES = 10_000;
// D3: the only entities the adapter may read.
const ENTITIES = new Set(["User", "EmpEmployment", "EmpJob", "FODepartment"]);

export type GetOptions = { select: string[]; filter?: string; asOfDate?: string };

export type SuccessFactorsClient = {
  token(): Promise<string>;
  get(entity: string, opts: GetOptions): Promise<unknown[]>;
};

export function successFactorsClient(opts: {
  settings: SuccessFactorsSettings;
  privateKeyPem: string;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Waits between retries; injectable so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
}): SuccessFactorsClient {
  const { settings } = opts;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const host = new URL(settings.apiHost).origin;
  let cached: { token: string; until: number } | null = null;
  let pending: Promise<string> | null = null;

  async function send(what: string, url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new Error(`${what} failed: network`);
    }
  }

  async function requestToken(): Promise<string> {
    const signed = signAssertion(
      buildAssertion({
        apiHost: host,
        clientId: settings.clientId,
        apiUserId: settings.apiUserId,
        now: now(),
        id: `_${randomUUID()}`,
      }),
      opts.privateKeyPem,
    );
    const res = await send("SuccessFactors token request", `${host}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        company_id: settings.companyId,
        client_id: settings.clientId,
        grant_type: GRANT,
        new_token: "true",
        assertion: Buffer.from(signed, "utf8").toString("base64"),
      }),
    });
    if (!res.ok) throw new Error(`SuccessFactors token request failed: ${res.status}`);
    let body: { access_token?: unknown; expires_in?: unknown };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new Error("SuccessFactors token request failed: unreadable response");
    }
    if (typeof body.access_token !== "string" || !body.access_token) {
      throw new Error("SuccessFactors token request failed: no token");
    }
    const seconds = typeof body.expires_in === "number" ? body.expires_in : 0;
    cached = { token: body.access_token, until: now().getTime() + seconds * 1000 - EARLY_MS };
    return cached.token;
  }

  async function token(): Promise<string> {
    if (cached && cached.until > now().getTime()) return cached.token;
    pending ??= requestToken().finally(() => {
      pending = null;
    });
    return pending;
  }

  async function page(url: string): Promise<{ results: unknown[]; next: string | null }> {
    for (let attempt = 0; ; attempt++) {
      const res = await send("SuccessFactors request", url, {
        headers: { authorization: `Bearer ${await token()}`, accept: "application/json" },
      });
      if ((res.status === 429 || res.status === 503) && attempt < RETRIES) {
        const asked = Number(res.headers.get("retry-after"));
        const seconds = Number.isFinite(asked) && asked >= 0 ? Math.min(asked, MAX_WAIT_S) : 1;
        await sleep(seconds * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`SuccessFactors request failed: ${res.status}`);
      let body: { d?: { results?: unknown; __next?: unknown } };
      try {
        body = (await res.json()) as typeof body;
      } catch {
        throw new Error("SuccessFactors request failed: unreadable response");
      }
      const results = body.d?.results;
      if (!Array.isArray(results)) throw new Error("SuccessFactors request failed: unexpected response");
      const next = typeof body.d?.__next === "string" && body.d.__next ? body.d.__next : null;
      return { results, next };
    }
  }

  return {
    token,
    async get(entity, { select, filter, asOfDate }) {
      if (!ENTITIES.has(entity)) throw new Error("SuccessFactors request refused: entity not allowed");
      if (!Array.isArray(select) || select.length === 0 || select.some((f) => !/^\w+$/.test(f))) {
        throw new Error("SuccessFactors request refused: $select is required");
      }
      const q = new URLSearchParams({ $select: select.join(","), $format: "json", $top: String(PAGE) });
      if (filter) q.set("$filter", filter);
      if (asOfDate) q.set("asOfDate", asOfDate);
      let url: string | null = `${host}/odata/v2/${entity}?${q.toString()}`;
      const rows: unknown[] = [];
      for (let n = 0; url; n++) {
        if (n >= MAX_PAGES) throw new Error("SuccessFactors request failed: too many pages");
        const { results, next } = await page(url);
        rows.push(...results);
        if (next === null) break;
        let target: URL;
        try {
          target = new URL(next, host);
        } catch {
          throw new Error("SuccessFactors page link refused: not a URL");
        }
        if (target.origin !== host) throw new Error("SuccessFactors page link refused: not on the configured API host");
        url = target.toString();
      }
      return rows;
    },
  };
}
