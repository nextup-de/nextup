// The SAML bearer assertion for SuccessFactors OAuth (plan SFX, D6). NextUp builds and signs it itself with
// the private key of the X.509 certificate registered on the customer's OAuth client; /oauth/idp is not called.
//
// Shape: SAP "Creating a SAML assertion" (SuccessFactors OAuth 2.0 with SAML bearer): SAML 2.0, Issuer
// www.successfactors.com, Subject NameID = API user id, bearer SubjectConfirmation with Recipient
// <apiHost>/oauth/token and NotOnOrAfter, Conditions NotBefore/NotOnOrAfter, Audience www.successfactors.com,
// AuthnStatement, Attribute api_key = client id, enveloped RSA-SHA256 signature with exclusive c14n.
// Deviation from SAP's sample: the sample's KeyInfo is omitted on purpose, because SAP validates against the
// certificate registered on the client. The shape follows D6 and was not re-checked against SAP's live
// documentation in this change; docs/customer/SUCCESSFACTORS_SETUP.md is where a difference gets recorded.
import { SignedXml } from "xml-crypto";

const NS = "urn:oasis:names:tc:SAML:2.0:assertion";
export const SAP_ISSUER = "www.successfactors.com";
const BEFORE_MS = 5 * 60_000;
const AFTER_MS = 10 * 60_000;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const instant = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

export type AssertionInput = { apiHost: string; clientId: string; apiUserId: string; now: Date; id: string };

/** The unsigned assertion as an XML string. `id` must be a valid XML ID (starts with a letter or underscore). */
export function buildAssertion({ apiHost, clientId, apiUserId, now, id }: AssertionInput): string {
  const t = now.getTime();
  const recipient = `${apiHost.replace(/\/+$/, "")}/oauth/token`;
  const notOnOrAfter = instant(t + AFTER_MS);
  return (
    `<saml2:Assertion xmlns:saml2="${NS}" ID="${esc(id)}" IssueInstant="${instant(t)}" Version="2.0">` +
    `<saml2:Issuer>${SAP_ISSUER}</saml2:Issuer>` +
    `<saml2:Subject>` +
    `<saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">${esc(apiUserId)}</saml2:NameID>` +
    `<saml2:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
    `<saml2:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${esc(recipient)}"/>` +
    `</saml2:SubjectConfirmation></saml2:Subject>` +
    `<saml2:Conditions NotBefore="${instant(t - BEFORE_MS)}" NotOnOrAfter="${notOnOrAfter}">` +
    `<saml2:AudienceRestriction><saml2:Audience>${SAP_ISSUER}</saml2:Audience></saml2:AudienceRestriction>` +
    `</saml2:Conditions>` +
    `<saml2:AuthnStatement AuthnInstant="${instant(t)}"><saml2:AuthnContext>` +
    `<saml2:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified</saml2:AuthnContextClassRef>` +
    `</saml2:AuthnContext></saml2:AuthnStatement>` +
    `<saml2:AttributeStatement><saml2:Attribute Name="api_key">` +
    `<saml2:AttributeValue>${esc(clientId)}</saml2:AttributeValue></saml2:Attribute></saml2:AttributeStatement>` +
    `</saml2:Assertion>`
  );
}

/** Signs the assertion (enveloped, RSA-SHA256, exclusive c14n). The error never carries the key. */
export function signAssertion(xml: string, privateKeyPem: string): string {
  try {
    const sig = new SignedXml({
      privateKey: privateKeyPem,
      signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
      canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
    });
    sig.addReference({
      xpath: "/*[local-name()='Assertion']",
      transforms: [
        "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
        "http://www.w3.org/2001/10/xml-exc-c14n#",
      ],
      digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    });
    sig.computeSignature(xml, {
      location: { reference: "/*[local-name()='Assertion']/*[local-name()='Issuer']", action: "after" },
    });
    return sig.getSignedXml();
  } catch {
    throw new Error("SuccessFactors assertion signing failed");
  }
}
