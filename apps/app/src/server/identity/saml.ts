// SAML 2.0 sign-in (EID D9): the IdentityProvider adapter and the two steps the routes call.
// node-saml checks the signature, audience, InResponseTo and times; this file adds the issuer check,
// the assertion replay check, the claim mapping and the refusal of encrypted assertions. RelayState is
// a signed flow token, not a cookie: a sameSite lax cookie does not ride the identity provider's POST.
import type { IdentityClaims, IdentityProvider, LoginCallback, LoginStart } from "@nextup/contracts/public";
import { SAML, ValidateInResponseTo, type CacheItem, type CacheProvider } from "@node-saml/node-saml";
import { DOMParser } from "@xmldom/xmldom";
import { holdsRealPeople } from "@/features/admin/stages";
import { FLOW_TTL_SECONDS, randomToken, signFlow, verifyFlow, type Flow } from "@/features/auth/entra";
import { parseSamlSettings, type SamlSettings } from "@/features/identity/settings";
import { companyOrigin, companyPrefix } from "@/features/tenant/urls";
import { getDb, hasDatabase } from "@/lib/db/client";
import { getIntegration } from "@/lib/db/integrations";
import { saveOnce, takeOnce, useOnce as acceptOnce } from "@/lib/db/sso";
import { SsoError, finishSsoLogin, loginErrorUrl, storeFailedTest, type SsoErrorCode } from "@/server/identity/finish";
import { safeNext } from "@/server/microsoft-login";

const SKEW_MS = 120_000;
const REQUEST_TTL_MS = 600_000;
const MAX_RESPONSE_CHARS = 1_400_000; // base64 of about 1 MB
const RELAY_MARK = "saml-relay"; // verifier of our flow tokens, so a Microsoft flow token is never taken for one
const FORMAT_EMAIL = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

type SamlFlow = Flow & { test?: boolean };

export const samlEntityId = (origin: string, slug: string) => `${origin}${companyPrefix(slug)}/login/saml/metadata`;
export const samlAcsUrl = (origin: string, slug: string) => `${origin}${companyPrefix(slug)}/login/saml/acs`;

/** node-saml's request-id cache on SsoReplay. Reading does not use the id up; removing does. */
function requestCache(companyId: string): CacheProvider {
  const keyOf = (id: string) => `saml-req:${companyId}:${id}`;
  return {
    async saveAsync(key: string, value: string): Promise<CacheItem | null> {
      await saveOnce(keyOf(key), companyId, new Date(Date.now() + REQUEST_TTL_MS));
      return { value, createdAt: Date.now() };
    },
    async getAsync(key: string): Promise<string | null> {
      const row = await getDb().ssoReplay.findUnique({ where: { key: keyOf(key) } });
      if (!row || row.expiresAt <= new Date()) return null;
      return new Date(row.expiresAt.getTime() - REQUEST_TTL_MS).toISOString();
    },
    async removeAsync(key: string | null): Promise<string | null> {
      if (key) await takeOnce(keyOf(key));
      return key;
    },
  };
}

function samlFor(companyId: string, slug: string, origin: string, s: SamlSettings): SAML {
  return new SAML({
    entryPoint: s.ssoUrl,
    idpCert: s.idpCerts,
    idpIssuer: s.idpEntityId,
    issuer: samlEntityId(origin, slug),
    audience: samlEntityId(origin, slug),
    callbackUrl: samlAcsUrl(origin, slug),
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    signatureAlgorithm: "sha256",
    acceptedClockSkewMs: SKEW_MS,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: REQUEST_TTL_MS,
    disableRequestedAuthnContext: true,
    cacheProvider: requestCache(companyId),
  });
}

const textOf = (v: unknown): string | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" && x.trim() ? x.trim() : null;
};

/** The assertion's ID and the moment it stops being acceptable, from the (signed) assertion XML. */
function assertionFacts(xml: string): { id: string; notOnOrAfter: Date | null } | null {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  const id = root?.getAttribute("ID");
  if (!id) return null;
  const conditions = root.getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "Conditions")[0];
  const when = conditions?.getAttribute("NotOnOrAfter");
  const t = when ? new Date(when) : null;
  return { id, notOnOrAfter: t && !Number.isNaN(t.getTime()) ? t : null };
}

export type SamlCompleted = { claims: IdentityClaims; next: string; test: boolean };

export type SamlProvider = IdentityProvider & {
  startLogin(input: { companyId: string; returnTo: string; test?: boolean }): Promise<LoginStart>;
  complete(input: LoginCallback): Promise<SamlCompleted>;
};

/** Null when the SAML row is missing, off or unparsable. */
export async function samlProvider(companyId: string, origin: string): Promise<SamlProvider | null> {
  if (!hasDatabase()) return null;
  const row = await getIntegration(companyId, "saml");
  if (!row || !row.on) return null;
  const parsed = parseSamlSettings(row.settings);
  if (!parsed.ok) return null;
  const settings = parsed.value;
  const company = await getDb().company.findUnique({ where: { id: companyId }, select: { slug: true } });
  if (!company) return null;
  const slug = company.slug;
  const authSecret = process.env.AUTH_SECRET;
  const saml = samlFor(companyId, slug, origin, settings);

  const complete = async (input: LoginCallback): Promise<SamlCompleted> => {
    const flow = authSecret ? (verifyFlow(input.state, authSecret) as SamlFlow | null) : null;
    const test = flow?.test === true;
    try {
      if (!flow || flow.as !== undefined || flow.verifier !== RELAY_MARK || flow.slug !== slug) {
        throw new SsoError(input.state ? "expired" : "state");
      }
      const raw = input.params.SAMLResponse;
      if (!raw || raw.length > MAX_RESPONSE_CHARS) throw new SsoError("invalid_response");
      const xml = Buffer.from(raw, "base64").toString("utf8");
      if (/<!DOCTYPE/i.test(xml)) throw new SsoError("invalid_response");
      // No decryption key (Q2): an encrypted assertion is refused, never half-read.
      if (/EncryptedAssertion/.test(xml)) throw new SsoError("invalid_response");

      let profile;
      try {
        ({ profile } = await saml.validatePostResponseAsync({ SAMLResponse: raw }));
      } catch (err) {
        console.warn(`[saml] ${slug}: response refused: ${err instanceof Error ? err.message.slice(0, 200) : "error"}`);
        throw new SsoError("invalid_response");
      }
      if (!profile) throw new SsoError("invalid_response");
      if (profile.issuer !== settings.idpEntityId) throw new SsoError("invalid_response");
      if (typeof profile.nameID !== "string" || !profile.nameID) throw new SsoError("invalid_response");

      // The request id is used up whatever node-saml did with it.
      if (typeof profile.inResponseTo === "string") await takeOnce(`saml-req:${companyId}:${profile.inResponseTo}`);

      const facts = profile.getAssertionXml ? assertionFacts(profile.getAssertionXml()) : null;
      if (!facts) throw new SsoError("invalid_response");
      // Kept until the assertion could no longer be accepted, clock skew included.
      const keepUntil = new Date((facts.notOnOrAfter?.getTime() ?? Date.now() + 3_600_000) + SKEW_MS);
      if (!(await acceptOnce(`saml-assert:${companyId}:${facts.id}`, companyId, keepUntil))) throw new SsoError("invalid_response");

      const attrs = (profile.attributes && typeof profile.attributes === "object" ? profile.attributes : {}) as Record<string, unknown>;
      const claimed = textOf(attrs[settings.emailAttribute]) ?? (profile.nameIDFormat === FORMAT_EMAIL ? profile.nameID : null);
      const email = claimed && /^[^@\s]+@[^@\s]+$/.test(claimed) ? claimed : null;
      const displayName = (textOf(attrs[settings.nameAttribute]) ?? email ?? profile.nameID).slice(0, 120);
      const department = settings.departmentAttribute ? textOf(attrs[settings.departmentAttribute]) : null;
      const claims: IdentityClaims = {
        issuer: settings.idpEntityId, subject: profile.nameID, email, displayName,
        tenantId: null, groups: [], appRoles: [], department, externalIds: {},
      };
      return { claims, next: flow.next, test };
    } catch (err) {
      if (err instanceof SsoError) throw new SsoError(err.code, test);
      console.warn(`[saml] ${slug}: sign-in failed`, err);
      throw new SsoError("failed", test);
    }
  };

  return {
    info: { kind: "IdentityProvider", id: "saml", contractVersion: 1 },
    async startLogin({ returnTo, test }: { companyId: string; returnTo: string; test?: boolean }) {
      if (!authSecret) throw new SsoError("failed");
      const state = randomToken();
      const exp = Math.floor(Date.now() / 1000) + FLOW_TTL_SECONDS;
      const flow: SamlFlow = { slug, state, nonce: randomToken(), verifier: RELAY_MARK, next: safeNext(returnTo), exp, ...(test ? { test: true } : {}) };
      const redirectUrl = await saml.getAuthorizeUrlAsync(signFlow(flow, authSecret), new URL(origin).host, {});
      return { state, redirectUrl };
    },
    async completeLogin(input) {
      return (await complete(input)).claims;
    },
    complete,
  };
}

async function companyBySlug(slug: string): Promise<{ id: string; stage: string } | null> {
  if (!hasDatabase()) return null;
  return getDb().company.findUnique({ where: { slug }, select: { id: true, stage: true } });
}

/** Step 1. `test` has been checked by the route. Returns where to redirect. */
export async function startSamlLogin(slug: string, next: string | null, test: boolean): Promise<string> {
  const company = await companyBySlug(slug);
  if (!company) return loginErrorUrl(slug, "not_on");
  if (!holdsRealPeople(company.stage)) return loginErrorUrl(slug, "demo_company");
  const provider = await samlProvider(company.id, companyOrigin(slug));
  if (!provider) return loginErrorUrl(slug, "not_on");
  try {
    return (await provider.startLogin({ companyId: company.id, returnTo: next ?? "", test })).redirectUrl;
  } catch (err) {
    const code: SsoErrorCode = err instanceof SsoError ? err.code : "failed";
    console.warn(`[saml] ${slug}: could not start`, err instanceof SsoError ? code : err);
    return loginErrorUrl(slug, code);
  }
}

/** Step 2: the POSTed form (SAMLResponse, RelayState). Returns where to redirect. */
export async function finishSamlLogin(slug: string, origin: string, form: Record<string, string>): Promise<string> {
  const company = await companyBySlug(slug);
  if (!company) return loginErrorUrl(slug, "not_on");
  const provider = await samlProvider(company.id, origin);
  if (!provider) return loginErrorUrl(slug, "not_on");
  let done: SamlCompleted;
  try {
    done = await provider.complete({ state: form.RelayState ?? "", params: form });
  } catch (err) {
    const code: SsoErrorCode = err instanceof SsoError ? err.code : "failed";
    return err instanceof SsoError && err.test ? storeFailedTest(company.id, slug, "saml", code) : loginErrorUrl(slug, code);
  }
  const { redirect } = await finishSsoLogin({
    companyId: company.id, slug, provider: "saml", claims: done.claims, test: done.test, origin, next: done.next,
  });
  return redirect;
}
