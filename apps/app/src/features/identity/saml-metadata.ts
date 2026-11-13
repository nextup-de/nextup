// SAML metadata (EID D9): read an identity provider's metadata, fetch it over https, write ours, and
// say how long a signing certificate has left. No React, no database. The XML is untrusted: a DOCTYPE
// or anything over 1 MB is refused before it is parsed.
import { X509Certificate } from "node:crypto";
import { generateServiceProviderMetadata } from "@node-saml/node-saml";
import { DOMParser } from "@xmldom/xmldom";
import { allowedUrl, type Parsed } from "@/features/identity/settings";

export const METADATA_MAX_BYTES = 1_048_576; // 1 MB
const MD = "urn:oasis:names:tc:SAML:2.0:metadata";
const DS = "http://www.w3.org/2000/09/xmldsig#";
const REDIRECT_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";
const MAX_CERTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type IdpMetadata = {
  entityId: string;
  /** The HTTP-Redirect SingleSignOnService location. */
  ssoUrl: string;
  /** Signing certificates as PEM, first three. */
  certs: string[];
  /** `validTo` of each certificate, same order, ISO. */
  certExpiresAt: string[];
};

const fail = (message: string): { ok: false; errors: string[] } => ({ ok: false, errors: [message] });

const toPem = (b64: string): string => `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)?.join("\n") ?? ""}\n-----END CERTIFICATE-----\n`;

function children(parent: Element, ns: string, name: string): Element[] {
  const found = parent.getElementsByTagNameNS(ns, name);
  const out: Element[] = [];
  for (let i = 0; i < found.length; i++) out.push(found[i]);
  return out;
}

/** The entity ID, redirect sign-on URL and signing certificates of an identity provider's metadata. */
export function parseIdpMetadata(xml: string): Parsed<IdpMetadata> {
  if (Buffer.byteLength(xml, "utf8") > METADATA_MAX_BYTES) return fail("metadata is larger than 1 MB");
  if (/<!DOCTYPE/i.test(xml)) return fail("metadata contains a DOCTYPE, which is not allowed");

  let doc: Document;
  try {
    const problems: string[] = [];
    doc = new DOMParser({ errorHandler: (level: string, msg: unknown) => { if (level !== "warning") problems.push(String(msg)); } }) // warnings pass, errors and fatal errors fail the parse
      .parseFromString(xml, "text/xml") as unknown as Document;
    if (problems.length || !doc.documentElement) return fail("metadata is not well-formed XML");
  } catch {
    return fail("metadata is not well-formed XML");
  }

  const descriptors = children(doc.documentElement, MD, "EntityDescriptor");
  if (doc.documentElement.namespaceURI === MD && doc.documentElement.localName === "EntityDescriptor") descriptors.unshift(doc.documentElement);
  const idpEntity = descriptors.find((d) => children(d, MD, "IDPSSODescriptor").length > 0);
  if (descriptors.length === 0) return fail("no EntityDescriptor found");
  if (!idpEntity) return fail("no IDPSSODescriptor found");
  const entityId = idpEntity.getAttribute("entityID")?.trim();
  if (!entityId) return fail("EntityDescriptor has no entityID");

  const idp = children(idpEntity, MD, "IDPSSODescriptor")[0];
  const redirect = children(idp, MD, "SingleSignOnService").find((s) => s.getAttribute("Binding") === REDIRECT_BINDING);
  const ssoUrl = redirect?.getAttribute("Location")?.trim();
  if (!ssoUrl) return fail("no SingleSignOnService with the HTTP-Redirect binding");

  const certs: string[] = [];
  const expires: string[] = [];
  for (const key of children(idp, MD, "KeyDescriptor")) {
    const use = key.getAttribute("use");
    if (use && use !== "signing") continue;
    for (const node of children(key, DS, "X509Certificate")) {
      const b64 = (node.textContent ?? "").replace(/\s+/g, "");
      if (!b64) continue;
      try {
        const pem = toPem(b64);
        const validTo = new Date(new X509Certificate(pem).validTo);
        if (Number.isNaN(validTo.getTime())) continue;
        if (certs.includes(pem) || certs.length >= MAX_CERTS) continue;
        certs.push(pem);
        expires.push(validTo.toISOString());
      } catch {
        // not a certificate: skipped; if none is left the metadata is refused below
      }
    }
  }
  if (certs.length === 0) return fail("no signing certificate");
  return { ok: true, value: { entityId, ssoUrl, certs, certExpiresAt: expires } };
}

/** Downloads metadata: https (the test fakes on localhost aside), 10 s, 1 MB. */
export async function fetchIdpMetadata(url: string): Promise<Parsed<string>> {
  if (!allowedUrl(url)) return fail("the metadata address must be https");
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "application/samlmetadata+xml, application/xml, text/xml" } });
    if (!res.ok) return fail(`the metadata address answered ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > METADATA_MAX_BYTES || !res.body) return fail(declared ? "metadata is larger than 1 MB" : "the metadata address sent nothing");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > METADATA_MAX_BYTES) {
        await reader.cancel();
        return fail("metadata is larger than 1 MB");
      }
      chunks.push(value);
    }
    return { ok: true, value: Buffer.concat(chunks).toString("utf8") };
  } catch {
    return fail("the metadata could not be downloaded");
  }
}

/** Our service provider metadata: the entity ID and the HTTP-POST assertion consumer service. */
export function spMetadata(p: { entityId: string; acsUrl: string }): string {
  return generateServiceProviderMetadata({ issuer: p.entityId, callbackUrl: p.acsUrl, wantAssertionsSigned: true });
}

export type CertStatus = "ok" | "soon" | "expired";

/** `soon` is 30 days or less. */
export function certStatus(expiresAt: string | Date, now: Date = new Date()): CertStatus {
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(left) || left <= 0) return "expired";
  return left <= 30 * DAY_MS ? "soon" : "ok";
}
