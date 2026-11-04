# Setting up single sign-on, provisioning and log export (for your IT administrator)

> **Updated 2026-11-04.** Plan EID. Written for the company stack at `https://<company>.sellux.ch`. Where a stack serves
> several companies from one address, put `/<company>` in front of every path below (`<origin>/<company>/login/saml/acs`).

NextUp can use your identity provider in three ways, and send its audit log to your SIEM. **All four are off until a
company admin switches them on** on the *Sign-in* page (Settings → Sign-in). While they are off, nothing changes:
people keep signing in with their personal code or with Microsoft, and the SCIM address answers `403`.

| Feature | What it does |
|---|---|
| OpenID Connect (OIDC) | a "Continue with …" button on the login page, for Okta, Keycloak, Entra and any other OIDC provider |
| SAML 2.0 | the same button for SAML providers: Entra, Okta, ADFS and others |
| SCIM 2.0 | your directory creates, changes and deactivates people in NextUp |
| Log export | NextUp's audit log goes to your syslog server or to a JSON file |

SSO **never creates an account and never changes a role.** People come from SCIM, the directory sync, the import or an
invite. Sign-in only recognises them (see *How a person is recognised* below).

## What an admin sees on the Sign-in page

Four cards: **OIDC**, **SAML**, **SCIM** and **Log export**. Each shows one state: *off*, *on*, *needs you* (saved but
not complete, or the last test failed), *error*, or *demo* (OIDC, SAML and SCIM are not available for a demo company).

- OIDC and SAML: a form, a **Save**, a switch, and **Test sign-in**. The test runs the whole flow in your browser and
  stores the result on the card; it signs nobody in and links nothing.
- SCIM: the endpoint to copy, a switch and **Replace token**. The token is shown **once**. Replacing it revokes the old
  token at once.
- Log export: target, address and port, a switch, **Send test record**, and the last error if the last delivery failed.
- Every save, switch and token change is written to the audit log. Secrets, tokens and certificates are never in it.

## How a person is recognised

1. If this account was seen before (same issuer and subject), that person signs in. Email changes do not matter.
2. Otherwise NextUp looks for **exactly one active person in your company whose email equals the email from the identity
   provider** (case-insensitive) and who has no link for that provider yet, and links them. Display names are never compared.
3. No match, several matches, or an inactive person: the sign-in is refused with a message on the login page
   (`unknown_user`, `ambiguous`, `inactive`). Nobody is created.

Role and department come from NextUp (SCIM, import, invite), not from the sign-in.

## Microsoft Entra

Plain Microsoft sign-in with app roles is described in [`ENTRA_SETUP.md`](ENTRA_SETUP.md). Use this guide instead if you
want Entra as a generic SAML or OIDC provider, or want SCIM provisioning.

### SAML (enterprise application)

1. Entra admin center → **Enterprise applications → New application → Create your own application** (non-gallery), name `NextUp`.
2. **Single sign-on → SAML.** Basic SAML configuration:
   - Identifier (Entity ID): `https://<company>.sellux.ch/login/saml/metadata`
   - Reply URL (ACS), HTTP-POST: `https://<company>.sellux.ch/login/saml/acs`
   - Leave *Sign-on URL* and *Logout URL* empty.
3. **Attributes & claims:** `emailaddress` = `user.mail`, `name` = `user.displayname`. Optional: add a claim named
   `department` = `user.department`.
4. **SAML Certificates:** keep *Sign SAML assertion* (not "response only"). Copy the **App Federation Metadata URL**.
5. Do not turn on token encryption (see the ADFS note: NextUp refuses encrypted assertions).
6. **Users and groups:** assign who may sign in.
7. In NextUp, **Sign-in → SAML:** paste the metadata URL (or upload the XML), set a button text, **Save**, **Test sign-in**, switch **on**.

### OIDC

1. **App registrations → New registration**, single tenant. Redirect URI (Web): `https://<company>.sellux.ch/login/oidc/callback`.
2. **Certificates & secrets:** create a client secret and note its expiry.
3. **Token configuration:** add the optional claim `email` to the ID token.
4. In NextUp, **Sign-in → OIDC:** issuer `https://login.microsoftonline.com/<tenant-id>/v2.0`, the client ID, the client
   secret, a button text. **Save**, **Test sign-in**, switch **on**.

### SCIM provisioning

1. In the enterprise application: **Provisioning → Automatic**.
2. Tenant URL: `https://<company>.sellux.ch/api/scim/<company>/v2`. Secret token: the token from NextUp (see *SCIM in NextUp*).
   **Test connection.**
3. **Mappings → Provision Microsoft Entra ID Users:** keep `userPrincipalName → userName`, `mail → emails[type eq "work"].value`,
   `objectId → externalId`, `givenName`, `surname`, `displayName`, `Switch([IsSoftDeleted], …) → active`, `jobTitle → title`,
   and `department` and `manager` (enterprise extension). Add `employeeId → employeeNumber` only if you want the personnel
   number used for matching. Remove other mappings; NextUp ignores them anyway.
4. Scope to **assigned users and groups**, then switch provisioning on.

## Okta

### OIDC app

1. **Applications → Create App Integration → OIDC → Web Application.**
2. Sign-in redirect URI: `https://<company>.sellux.ch/login/oidc/callback`. Assign the people who may use it.
3. In NextUp: issuer = your Okta authorization server, e.g. `https://<your-org>.okta.com` (or `…/oauth2/default`), the client ID
   and secret of the app. Scopes `openid email profile`.

### SAML app

1. **Create App Integration → SAML 2.0.**
2. Single sign-on URL: `https://<company>.sellux.ch/login/saml/acs`. Audience URI (SP Entity ID): `https://<company>.sellux.ch/login/saml/metadata`.
3. Name ID format `EmailAddress`, application username `Email`. **Assertion Signature: Signed.**
   Assertion Encryption: **Unencrypted**.
4. Attribute statements: `email` = `user.email`, `name` = `user.displayName`, optional `department` = `user.department`.
5. Copy the **Metadata URL** from the *Sign On* tab into NextUp. If you used other attribute names, set them in the
   SAML card (email, name, department attribute).

### SCIM

**Provisioning → Integration → Enable SCIM provisioning** on the SAML app: base URL
`https://<company>.sellux.ch/api/scim/<company>/v2`, unique identifier field `userName`, supported actions *Push New Users* and
*Push Profile Updates* (groups off). Authentication: HTTP Header, *Authorization* = `Bearer <token>`. Enable
*Create Users*, *Update User Attributes*, *Deactivate Users*.

## ADFS

1. **AD FS Management → Relying Party Trusts → Add.** Claims aware, enter data manually.
2. Identifier: `https://<company>.sellux.ch/login/saml/metadata`. Add an endpoint: SAML Assertion Consumer, POST,
   `https://<company>.sellux.ch/login/saml/acs`.
3. **Encryption:** do not add an encryption certificate, and remove any on the *Encryption* tab. NextUp does not decrypt
   assertions and refuses an encrypted one. Signature algorithm SHA-256.
4. **Claim issuance policy.** Send LDAP attributes as claims, from Active Directory:
   - `E-Mail-Addresses` → `E-Mail Address`
   - `Display-Name` → `Name`
   - `Department` → `department` (custom claim type, optional)

   Then a transform rule *Transform an Incoming Claim*: `E-Mail Address` → outgoing `Name ID`, format `Email`.
5. The **assertion** must be signed: `Set-AdfsRelyingPartyTrust -SamlResponseSignature MessageAndAssertion` signs both.
6. In NextUp, paste the federation metadata URL (`https://<adfs>/FederationMetadata/2007-06/FederationMetadata.xml`) or upload the file.
   If you named the department claim differently, set it in the SAML card.

ADFS has no SCIM; use the directory sync or the import for people.

## Keycloak

1. Realm → **Clients → Create client**, type *OpenID Connect*, client authentication **on**, standard flow on.
2. Valid redirect URI: `https://<company>.sellux.ch/login/oidc/callback`.
3. In NextUp: issuer = `https://<keycloak>/realms/<realm>`, client ID, the secret from the *Credentials* tab.
   The client scope `email` must be on, and the email must be verified.

## SCIM in NextUp

1. In **Sign-in → SCIM** choose **Replace token**. Copy the token now; it is not shown again. Give it to your identity provider
   as `Authorization: Bearer <token>`. The token works for SCIM only and for your company only.
2. Base URL: `https://<company>.sellux.ch/api/scim/<company>/v2`.
3. Switch SCIM **on**. Until then every request gets `403`.

Supported: `ServiceProviderConfig`, `ResourceTypes`, `Schemas`, and `Users` with `GET` (filters `userName eq "…"` and
`externalId eq "…"` only, up to 100 per page), `POST`, `PUT`, `PATCH` (add, replace, remove) and `DELETE`. Not supported: groups, bulk,
sorting, ETags, password changes. `DELETE` and `active: false` **deactivate**; NextUp never deletes a person. A person who
already exists with the same email and has no SCIM link is linked, not duplicated.

### What NextUp stores from SCIM, and nothing else

| SCIM attribute | Used for |
|---|---|
| `userName`, `externalId` | matching |
| `name.givenName`, `name.familyName`, `name.formatted`, `displayName` | the person's name |
| work email (`emails[type eq "work"]`, else the primary, else the first) | email |
| `active` | active or deactivated |
| `title` | job title |
| `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User` → `department` | unit |
| same extension → `manager.value` (a NextUp user id, as returned in `id`) | manager |
| same extension → `employeeNumber` | the personnel number, for matching only |

Every other attribute is ignored: not stored, not logged. The personnel number is never returned by a `GET`, never shown, never
logged, never sent to the assistant. A new person gets the member role; SCIM does not set roles.
A deactivation also vacates the person's seats and hands their open cases on.

## Log export (syslog or JSON file)

Switch it on in **Sign-in → Log export**. Only the audit log goes out (who changed what, when), one record per entry.
**History is not sent**; it starts when you switch on (older entries stay in the audit CSV).

- **Syslog (RFC 5424).** Target host, port and transport: `tls` (default; TLS 1.2 or newer, server certificate verified against
  the system CAs plus an optional CA you paste), `tcp` or `udp`. TCP and TLS frame with octet counting (RFC 6587); UDP sends one
  datagram per record. One line:

  ```
  <110>1 2026-11-04T09:15:02.113Z nextup-host nextup - audit.connector.on [nextup@32473 id="clx…" companyId="clx…"] {"actorKind":"admin","source":"settings","changes":{…},"actorUserId":"clx…","target":"connector:oidc"}
  ```

  `<110>` is facility *log audit* (13), severity *info*. `nextup@32473` is the documentation enterprise number for now. The
  `id` is stable: if a delivery is repeated, drop the double by `id`.
- **JSON file.** One JSON record per line in `audit-YYYY-MM-DD.jsonl` (UTC day) in the stack's log folder
  (`/var/log/nextup`, or `LOG_EXPORT_DIR` set by your operator). Admins cannot choose the path.
- Delivery runs every minute, in order, and **at least once**: if your server is down, NextUp keeps its place, shows the error on
  the card and retries.
- **Send test record** sends one `audit.test` record directly; it moves nothing.

## If something does not work

| What you see | Usually |
|---|---|
| `unknown_user` | no active person with that email; provision them first |
| `ambiguous` | two people share the email; fix one in NextUp |
| `inactive` | the person was deactivated (by SCIM or an admin) |
| `email_unverified`, `no_email` | the provider sends no verified email claim |
| `invalid_response` | SAML: wrong certificate, unsigned assertion, wrong audience, replayed or expired response, or an encrypted assertion |
| `state`, `expired` | the sign-in took too long or the browser blocked cookies; start again |
| `not_on` | the switch is off |
| SCIM `403` | switch off, or the token is for another company |
| SCIM `401` | unknown or replaced token |
| Log export error on the card | host, port, transport or certificate; the card shows the last error |

SAML assertions allow two minutes of clock difference; keep your servers on NTP. After your provider rolls its signing
certificate, use the SAML card's metadata refresh.
