// A SAML identity provider for tests (EID D18). No private key is ever committed: the key and the
// self-signed certificate are made at test time with the openssl CLI in os.tmpdir() and removed by stop().
// response(opts) builds a signed SAMLResponse (base64) and, per option, one attack on it.
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { SignedXml } from "xml-crypto";

const EMAIL = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress";
const NAME = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";
const FORMAT_EMAIL = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

export type ResponseOpts = {
  /** The ID of the AuthnRequest being answered (InResponseTo). */
  requestId: string;
  /** The service provider the response is for. */
  sp: { entityId: string; acsUrl: string };
  email?: string;
  name?: string;
  nameId?: string;
  /** Extra attributes, by name. */
  attributes?: Record<string, string>;
  /** A fixed assertion ID, to build a replay. */
  assertionId?: string;
  // the attacks
  /** No signature on the assertion. */
  unsigned?: boolean;
  /** Signed with a key the service provider does not trust. */
  otherKey?: boolean;
  /** A signed assertion plus an injected, unsigned one for someone else. */
  wrapped?: boolean;
  /** NotOnOrAfter ten minutes ago. */
  expired?: boolean;
  /** A different audience. */
  audience?: string;
  /** A different InResponseTo than the request. */
  inResponseTo?: string;
  /** A different issuer (response and assertion). */
  issuer?: string;
  /** An EncryptedAssertion instead of an assertion. */
  encrypted?: boolean;
};

export type TestIdp = {
  entityId: string;
  ssoUrl: string;
  /** The signing certificate (PEM). */
  cert: string;
  /** A certificate of another key, which the service provider is never told about. */
  otherCert: string;
  metadataXml: string;
  /** Serves metadataXml over http on 127.0.0.1. */
  metadataUrl: string;
  response(opts: ResponseOpts): string;
  stop(): Promise<void>;
};

function makeKey(dir: string, name: string): { key: string; cert: string } {
  const keyFile = join(dir, `${name}.key`);
  const certFile = join(dir, `${name}.crt`);
  execFileSync(
    "openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "3650", "-subj", `/CN=nextup-test-${name}`],
    { stdio: "pipe" },
  );
  return { key: readFileSync(keyFile, "utf8"), cert: readFileSync(certFile, "utf8") };
}

const b64 = (pem: string) => pem.replace(/-----[A-Z ]+-----|\s+/g, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sign(xml: string, key: string, cert: string): string {
  const sig = new SignedXml({
    privateKey: key,
    publicCert: cert,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  sig.addReference({
    xpath: "/*",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  sig.computeSignature(xml, { location: { reference: "/*/*[local-name(.)='Issuer']", action: "after" } });
  return sig.getSignedXml();
}

let counter = 0;

export async function makeTestIdp(): Promise<TestIdp> {
  const dir = mkdtempSync(join(tmpdir(), "nextup-saml-"));
  const main = makeKey(dir, "idp");
  const other = makeKey(dir, "other");

  const server: Server = createServer((req, res) => {
    if (req.url === "/metadata") {
      res.writeHead(200, { "content-type": "application/samlmetadata+xml" });
      res.end(idp.metadataXml);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const entityId = `${base}/idp`;
  const ssoUrl = `${base}/sso`;

  const metadataXml = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>${b64(main.cert)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${ssoUrl}/post"/>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${ssoUrl}"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

  function assertion(o: ResponseOpts, id: string, email: string, notOnOrAfter: string, issuer: string): string {
    const now = new Date();
    const attrs: Record<string, string> = { [EMAIL]: email, [NAME]: o.name ?? "Test Person", ...(o.attributes ?? {}) };
    const attributeXml = Object.entries(attrs)
      .map(([n, v]) => `<saml:Attribute Name="${esc(n)}"><saml:AttributeValue>${esc(v)}</saml:AttributeValue></saml:Attribute>`)
      .join("");
    return `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id}" Version="2.0" IssueInstant="${now.toISOString()}">` +
      `<saml:Issuer>${esc(issuer)}</saml:Issuer>` +
      `<saml:Subject><saml:NameID Format="${FORMAT_EMAIL}">${esc(o.nameId ?? email)}</saml:NameID>` +
      `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" InResponseTo="${esc(o.inResponseTo ?? o.requestId)}" Recipient="${esc(o.sp.acsUrl)}"/></saml:SubjectConfirmation></saml:Subject>` +
      `<saml:Conditions NotBefore="${new Date(now.getTime() - 60_000).toISOString()}" NotOnOrAfter="${notOnOrAfter}"><saml:AudienceRestriction><saml:Audience>${esc(o.audience ?? o.sp.entityId)}</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
      `<saml:AuthnStatement AuthnInstant="${now.toISOString()}" SessionIndex="_s${id}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>` +
      `<saml:AttributeStatement>${attributeXml}</saml:AttributeStatement>` +
      `</saml:Assertion>`;
  }

  const idp: TestIdp = {
    entityId, ssoUrl, cert: main.cert, otherCert: other.cert, metadataXml, metadataUrl: `${base}/metadata`,
    response(o) {
      const now = Date.now();
      const issuer = o.issuer ?? entityId;
      const email = o.email ?? "member@saml.test";
      const notOnOrAfter = new Date(now + (o.expired ? -10 * 60_000 : 5 * 60_000)).toISOString();
      const id = o.assertionId ?? `_a${now.toString(36)}${(counter++).toString(36)}`;

      let inner: string;
      if (o.encrypted) {
        inner = `<saml:EncryptedAssertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"><xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#" Type="http://www.w3.org/2001/04/xmlenc#Element"><xenc:CipherData><xenc:CipherValue>AAAA</xenc:CipherValue></xenc:CipherData></xenc:EncryptedData></saml:EncryptedAssertion>`;
      } else {
        const plain = assertion(o, id, email, notOnOrAfter, issuer);
        const useKey = o.otherKey ? other : main;
        inner = o.unsigned ? plain : sign(plain, useKey.key, useKey.cert);
        if (o.wrapped) inner = assertion({ ...o, nameId: "admin@saml.test" }, `${id}-evil`, "admin@saml.test", notOnOrAfter, issuer) + inner;
      }
      const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r${id}" Version="2.0" IssueInstant="${new Date(now).toISOString()}" Destination="${esc(o.sp.acsUrl)}" InResponseTo="${esc(o.inResponseTo ?? o.requestId)}">` +
        `<saml:Issuer>${esc(issuer)}</saml:Issuer>` +
        `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
        inner + `</samlp:Response>`;
      return Buffer.from(xml, "utf8").toString("base64");
    },
    async stop() {
      await new Promise<void>((ok) => server.close(() => ok()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
  return idp;
}

/** What the service provider sent to the sign-on URL: the AuthnRequest ID, issuer and the RelayState. */
export function readAuthnRequest(location: string): { id: string; issuer: string; relayState: string } {
  const url = new URL(location);
  const request = url.searchParams.get("SAMLRequest");
  if (!request) throw new Error("no SAMLRequest in " + location);
  const xml = inflateRawSync(Buffer.from(request, "base64")).toString("utf8");
  const id = /\bID="([^"]+)"/.exec(xml)?.[1];
  const issuer = /<(?:saml:)?Issuer[^>]*>([^<]+)</.exec(xml)?.[1];
  if (!id || !issuer) throw new Error("not an AuthnRequest: " + xml.slice(0, 200));
  return { id, issuer, relayState: url.searchParams.get("RelayState") ?? "" };
}
