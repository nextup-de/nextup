# Connecting SAP SuccessFactors to NextUp (for your HR IT administrator)

A few hours of work in SuccessFactors, plus the time your approvals take. When you are done, NextUp reads your org
chart once a day and keeps its people in step with it: new employees appear with their unit and manager, movers change
unit on the day the move takes effect, and leavers are deactivated from their end date and their open cases are handed
to a colleague. NextUp only ever **reads**. It never writes to SuccessFactors.

> Internal note: this is the handout for plan SFX. Send it with the company's address (`https://<company>.sellux.ch`)
> filled in. Ask for the API server address first: it differs per data centre. NextUp's support session in the console
> is read-only and cannot save these values (Q9.2): the customer's IT enters them, with NextUp on the call.

**Plan the lead time.** Plan several weeks for the API user and the works council. Creating the API user and the
OAuth client usually needs a change request in your SuccessFactors team, and where you have a works council the
agreement in step 7 has to be in place before the connection is switched on. Entering the values in step 6 is one
short call.

## What NextUp can and cannot see

NextUp asks SuccessFactors for four entities and, from each, only the fields listed here. Every request names its
fields explicitly (`$select`); NextUp never asks for "everything".

| Entity | Fields | Used for |
|---|---|---|
| `User` | `userId`, `firstName`, `lastName`, `email`, `lastModifiedDateTime` | name and work email |
| `EmpEmployment` | `personIdExternal`, `userId`, `startDate`, `endDate`, `lastModifiedDateTime` | the personnel number (matching only), start and end date |
| `EmpJob` | `userId`, `startDate`, `department`, `jobTitle`, `managerId`, `lastModifiedDateTime` | unit, job title, manager (as of today) |
| `FODepartment` | `externalCode`, `name`, `parent`, `status`, `lastModifiedDateTime` | the name of a department and its place in the tree |

NextUp does **not** read, request or store: absences or time data (`EmpTime`, `EmployeeTime`, infotype 2001), payroll,
compensation, performance, talent, business partners, or any other entity or field. The API user in step 2 should not
be able to read them either.

The personnel number (`personIdExternal`) is used only to recognise the same person again. It is never shown in the
NextUp screens, never written to a log or an error message, and never sent to the assistant.

SAP HCM on premise (ERP) is not connected directly; it works only through Microsoft Entra (see
`ENTRA_SETUP.md`, "Directory sync"). There is no HCM connector.

## What you do

### 1. Find your API server

The address of your SuccessFactors API server (for example `https://api4.successfactors.eu`) is listed by SAP for your
data centre; your SuccessFactors administrator knows it, and it is the host you log in to for API calls. It is a plain
`https://` address **without a path**. Also note your **Company ID** (the instance, shown on the login page and under
Admin Center → Company Settings).

### 2. Create a technical API user with read-only permissions

In Admin Center, create a dedicated user, for example `NEXTUP_API`. Do not reuse a person's account or an existing
integration user.

Under **Manage Permission Roles**, create a role for it, for example `NextUp directory read`, and give it **only**:

- **Employee Central API → read** access to the entities `User`, `EmpEmployment`, `EmpJob` and `FODepartment`, and
  field-level read permission on the fields in the table above (and not on others)
- **Manage Integration Tools → Allow Admin to Access OData API** (needed to call OData at all)

Then, under **Manage Permission Groups**, put the user in a group that can see the people you want in NextUp (a
target population is fine; NextUp reads only what this user may see). No write, no admin, no payroll or
compensation permission. Please do not widen the role later "to make it work": see the troubleshooting table.

The exact menu names vary a little by release; the point is a read-only role limited to these four entities.

### 3. Register an OAuth client with an X.509 certificate

In Admin Center → **Manage OAuth2 Client Applications → Register Client Application**:

- Application Name: `NextUp`
- Application URL: `https://<company>.sellux.ch`
- Bind to User: the API user from step 2 (`NEXTUP_API`)
- **Generate X.509 Certificate**: your SuccessFactors administrator generates the key pair here (Q3). Download the
  **private key** (a PEM file with a `-----BEGIN ... PRIVATE KEY-----` block). SuccessFactors keeps the certificate;
  NextUp needs the private key and never stores the certificate.

Save, then note the **API Key**. This is the client ID.

NextUp signs a short-lived SAML assertion with the private key and exchanges it at `<API server>/oauth/token` for an
access token (OAuth 2.0 SAML bearer). The assertion names `www.successfactors.com` as issuer and audience, the API user
as subject, and the API key as the `api_key` attribute. It is valid for ten minutes and signed with RSA-SHA256.

> Internal note (D6): the assertion shape was built from SAP's "Creating a SAML assertion" for SuccessFactors OAuth and
> is proven against a fake that verifies the signature. It has not been checked against a live tenant, and this
> session did not compare it with SAP's current documentation. Record any difference found at the first live run here.

### 4. Name your units like your departments

NextUp does not create units from SuccessFactors. A person is brought in when their **department name** (the `name`
of their `FODepartment`) matches the **name or key** of a unit in NextUp, ignoring case. A person whose department
matches no unit is skipped and counted as `no-unit`. Before the first run, add the units in NextUp
(**Settings → Org**), either named exactly like the departments, or with the department's external code (for example
`D100`) as the unit's key. Inactive departments (status `I`) are not offered as groups.

### 5. Have it ready for the call

Book a short call with NextUp. Have these at hand; they stay with you and are not sent to NextUp:

- the API server address
- the Company ID
- the API key (client ID)
- the API user's user name
- the **private key** from step 3

### 6. Enter it in the console (your IT, with NextUp on the call)

The person in your IT who signs in to the NextUp console (`/admin`) enters the values; NextUp looks on and helps. NextUp
support cannot save them: a support session in the console is read-only. Open **Connectors → Directory**:

1. Under **SAP SuccessFactors access** enter API server, Company ID, API key (client ID), API user and paste the
   private key. The key is write-only: it is sealed on save and never shown again. Leaving the field empty on a later
   save keeps the saved key.
2. **Test connection.** It makes one small call and reports "Connection works" or an error line, never data.
3. Choose **SAP SuccessFactors** as the source, switch **Sync** on, and use **Run now** for the first read.

The source stays off until step 7 is done.

### 7. Works agreement and data protection

Where you have a works council, this connection needs its agreement before it is switched on. A paragraph you can put
into the agreement or its annex:

> NextUp reads from SAP SuccessFactors, read-only and once per day, the organisation structure of the company: each
> employee's name, work email address, department, job title, manager, and start and end date of employment, and the
> departments with their hierarchy. The personnel number is used only to match the same person again; it is not shown
> to anyone. NextUp does not read or store absences, working time, payroll, compensation, performance or talent data,
> and does not write to SuccessFactors. The data serves to route cases to the right role holder and to deactivate
> leavers; it is not used to assess the performance or behaviour of individuals. Access uses a technical user with
> read-only permissions on the four entities named in the annex; the company can end it at any time by deactivating
> the user or the OAuth client.

Your data-protection officer should see the same paragraph.

## What the sync does

- **Daily full read.** The first run of each UTC day reads all four entities in full. This is what applies a move or
  an end date that becomes effective on a day nobody edited anything in SuccessFactors.
- **Changes in between.** Later runs the same day read only rows changed since the last run (with a five-minute
  overlap), plus the full rows of the people concerned.
- **Existing members.** A person who is already in NextUp (for example created by hand or by the sign-in) is matched
  **once, by work email** (case does not matter) when exactly one active NextUp user has that email and no personnel
  number yet; that user then carries the personnel number and is kept up to date. If several users share the email,
  or the user already has another personnel number, the person is skipped (`email-taken`). Names are never compared.
- **Movers.** The unit changes on the day the new job becomes effective (the job in force today counts; a job dated in
  the future is ignored until then).
- **Leavers.** A person whose employment end date is before today becomes inactive: they can no longer sign in, their
  seats are vacated and each open case on those seats is handed to the next active holder of the same role (if nobody
  else holds the role, it stays with the role).
- **Limits.** Up to 500 rows per request; a throttled request (429 or 503) is retried twice after `Retry-After`
  (at most 30 seconds), then the run fails and tries again at the next interval with the old position kept.

## If something does not work

| What you see in the console | Usually |
|---|---|
| "Connection failed: 400" at the token step | the private key does not belong to the certificate of the OAuth client, or the API key, Company ID or API user is wrong (steps 3 and 5) |
| "Connection failed: 401" or "403" | the API user lacks the permission to call OData or to read one of the four entities (step 2), or is not bound to the OAuth client |
| "Connection failed: 404" | the API server address is wrong, or has a path or a trailing part (step 1) |
| "Connection failed: 429" / "503" | SuccessFactors is throttling; try again later and tell us if it persists |
| "no adapter for successfactors" | the access is not saved, is switched off, or the saved key does not open: save it again |
| A person is missing in NextUp | their department matches no unit (step 4), or they have no work email, or their work email is used by several NextUp users |
| A mover did not move yet | the new job is dated in the future; it applies on its start date, at the first run of that day |
| A leaver still signs in | their end date is today or later: the person is active up to and including the end date |
| Nothing changes any more | **Sync** is off, or the last run failed: see "Last error" and "Last good run" in the console |
