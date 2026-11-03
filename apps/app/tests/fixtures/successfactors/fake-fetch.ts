// A fake SuccessFactors keyed by URL (as tests/db/directory.test.ts does for Graph). /oauth/token verifies the
// signature of the posted assertion against `cert` before it hands out a token; other URLs serve `pages`.
import { SignedXml } from "xml-crypto";

/** True when the XML carries an enveloped signature that verifies with the certificate. */
export function verifyAssertion(xml: string, certPem: string): boolean {
  const m = /<(?:\w+:)?Signature[\s>][\s\S]*<\/(?:\w+:)?Signature>/.exec(xml);
  if (!m) return false;
  try {
    const sig = new SignedXml({ publicCert: certPem });
    sig.loadSignature(m[0]);
    return sig.checkSignature(xml);
  } catch {
    return false;
  }
}

export type FakeRequest = { method: string; url: string; authorization: string | null; body: string | null };

export type FakeSuccessFactors = {
  fetch: typeof fetch;
  requests: FakeRequest[];
  /** The decoded assertions seen at /oauth/token. */
  assertions: string[];
  /** The next `count` page requests answer 429 with this Retry-After (seconds). */
  throttle(count: number, retryAfter?: string, status?: 429 | 503): void;
};

export function fakeSuccessFactors(opts: {
  /** Full URL (as requested) to the body served for it. */
  pages: Record<string, unknown>;
  cert: string;
  expiresIn?: number;
}): FakeSuccessFactors {
  const requests: FakeRequest[] = [];
  const assertions: string[] = [];
  let throttled = 0;
  let throttleHeader: string | undefined;
  let throttleStatus = 429;
  let issued = 0;
  const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  const fake: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = init?.body == null ? null : String(init.body);
    const headers = new Headers(init?.headers);
    requests.push({ method: init?.method ?? "GET", url, authorization: headers.get("authorization"), body });
    if (new URL(url).pathname === "/oauth/token") {
      const form = new URLSearchParams(body ?? "");
      const xml = Buffer.from(form.get("assertion") ?? "", "base64").toString("utf8");
      assertions.push(xml);
      if (form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:saml2-bearer" || !verifyAssertion(xml, opts.cert)) {
        return json(400, { error: "invalid_grant" });
      }
      issued += 1;
      return json(200, { access_token: `token-${issued}`, token_type: "Bearer", expires_in: opts.expiresIn ?? 86400 });
    }
    if (!headers.get("authorization")?.startsWith("Bearer token-")) return json(401, { error: "unauthorized" });
    if (throttled > 0) {
      throttled -= 1;
      return json(throttleStatus, { error: "slow down" }, throttleHeader === undefined ? {} : { "retry-after": throttleHeader });
    }
    // pages may be keyed by the URL as sent or in its readable form ($select=a,b instead of %24select=a%2Cb)
    const page = opts.pages[url] ?? opts.pages[decodeURIComponent(url.replace(/\+/g, " "))];
    return page === undefined ? json(404, { error: "not found" }) : json(200, page);
  };

  return {
    fetch: fake,
    requests,
    assertions,
    throttle(count, retryAfter, status = 429) {
      throttled = count;
      throttleHeader = retryAfter;
      throttleStatus = status;
    },
  };
}
