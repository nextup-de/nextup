# Setting up Microsoft sign-in for NextUp (for your IT administrator)

Twenty minutes in the Microsoft Entra admin center. When you are done, your people sign in to NextUp with their
work account, and *you* decide in Entra who gets in and in which role. NextUp never asks for a password.

> Internal note: this is the handout for phase 1 of `docs/plans/2026-10-22_sso-and-data-access.md`. Send it with the
> company's address (`https://<company>.sellux.ch`) filled in below.

## What NextUp can and cannot see

| NextUp asks Microsoft for | Why |
|---|---|
| `openid`, `profile`, `email` | who signed in: name, work email, a stable account id |
| The app roles you assign (`roles` claim) | which NextUp role the person has |

NextUp does **not** read mail, calendars, chats, files or your directory. This sign-in cannot read them: the app
registration below holds no such permission. (Reading company documents is a separate step that needs its own
approval from you, and from the works council where you have one.)

## What you do

### 1. Register the app

Entra admin center → **Identity → Applications → App registrations → New registration**.

- Name: `NextUp`
- Supported account types: **Accounts in this organizational directory only** (single tenant)
- Redirect URI, platform **Web**: `https://<company>.sellux.ch/login/microsoft/callback`

Note the **Application (client) ID** and the **Directory (tenant) ID** from the overview page.

### 2. Add the roles

Open **App registrations → NextUp → Manifest** and replace the `appRoles` array with the one below (or create the four
roles by hand under **App roles**, with exactly these *Values*). Keep the `id` values, they only need to be unique
inside your registration.

```json
"appRoles": [
  {
    "id": "0e79c0be-069c-4893-8a20-c04f6a789beb",
    "displayName": "NextUp Manager",
    "description": "Sees the dashboard and settings of the company in NextUp.",
    "value": "NextUp.Manager",
    "isEnabled": true,
    "allowedMemberTypes": ["User"]
  },
  {
    "id": "6bff3d0e-7ab3-49e4-ac5e-7e1c56b3ae5b",
    "displayName": "NextUp Leader",
    "description": "Gets the inbox of their team in NextUp.",
    "value": "NextUp.Leader",
    "isEnabled": true,
    "allowedMemberTypes": ["User"]
  },
  {
    "id": "837bee75-0570-464e-8a13-a767cc619797",
    "displayName": "NextUp Member",
    "description": "Raises problems and ideas in NextUp.",
    "value": "NextUp.Member",
    "isEnabled": true,
    "allowedMemberTypes": ["User"]
  },
  {
    "id": "5be3532a-a4db-45e8-8649-1fbd9e4b3383",
    "displayName": "NextUp Admin",
    "description": "Opens the company's NextUp admin area: people, sign-in, what the assistant may read.",
    "value": "NextUp.Admin",
    "isEnabled": true,
    "allowedMemberTypes": ["User"]
  }
]
```

Four roles: Manager, Leader and Member are the people of NextUp; Admin is separate and opens `/admin` only. One person
can hold Admin and a person role together. If someone holds several person roles, the most powerful one counts.

Optional, but recommended: in the same manifest, make the email address part of the token (some accounts have none):

```json
"optionalClaims": {
  "idToken": [{ "name": "email", "essential": false }]
}
```

### 3. Create a client secret

**Certificates & secrets → New client secret.** Pick an expiry (up to 24 months) and put the date in your calendar:
when it expires, sign-in stops until a new secret is installed. Copy the **Value** (not the secret ID) and send
it to NextUp through the channel we agreed on, never by plain email. We install it on your stack; it is never
printed or stored in our code.

### 4. Decide who gets in

**Enterprise applications → NextUp → Properties → Assignment required? = Yes → Save.**
Then **Users and groups → Add user/group**, pick a group and a role. Typical setup:

| Group | Role |
|---|---|
| everyone who should use NextUp | NextUp Member |
| team leads | NextUp Leader |
| department heads | NextUp Manager |
| the people who run NextUp for you | NextUp Admin |

With assignment required, a colleague you did not assign cannot sign in at all. When you move someone to another
group, their role changes at their next sign-in. Remove someone from all groups and they can no longer sign in
(existing sessions end within eight hours; ask us to end them sooner).

### 5. Consent

**Enterprise applications → NextUp → Permissions → Grant admin consent for your organisation.** It lists only the
sign-in permissions above (Microsoft adds `User.Read`, "sign in and read the signed-in person's profile", to every new registration; NextUp uses nothing beyond it). If your policy blocks user consent, this is the step that unblocks everybody.

### 6. Send us

- Application (client) ID
- Directory (tenant) ID
- the client secret (see step 3)

We install the client ID and secret on your stack (`install.sh --entra-client-id`) and put the tenant into your company
at the install (`install.sh --entra-tenant-id`), so the admin console opens with Microsoft from the start. Your IT can
change or remove the tenant later in the console (**Access**); the install never overwrites that. Then we test with you:
first an Admin, then a Manager, then a Member.

### 7. The first people

The stack starts with nobody in it, and the app roles are what lets people in:

- `NextUp.Admin` opens the admin console (`/admin`), with or without a NextUp account. Each sign-in is in the audit log.
- `NextUp.Manager` is **created as a manager at the first sign-in, even while the company is still closed**: managers
  set the company up. Assign it to your pilot lead first.
- `NextUp.Leader` and `NextUp.Member` are refused until a manager opens NextUp, and created at their first sign-in after.

So with Microsoft sign-in no bootstrap and no login codes are needed. Without Microsoft, the first people come from the
bootstrap ([`INSTALL.md`](INSTALL.md), section 5).

## Optional: let the assistant search people's files (Microsoft 365)

Only if you want it, and only after your works council and data-protection officer agree. Each person
decides for themselves with **Connect Microsoft 365** on their NextUp profile; nothing happens until
your NextUp admin turns it on in `/admin/assistant`.

- NextUp then asks Microsoft for **Files.Read.All** (delegated: read the files *that person* can
  open) and **offline_access** (search later without signing in again). Not mail, chats, calendars
  or lists. Grant admin consent for these two under **Permissions** (step 5) if your policy
  requires it.
- NextUp searches as that person, so it never sees more than they do, and copies nothing. Results
  are masked (names, emails, secrets) before the assistant's model reads them.
- Anyone can disconnect on their profile; your NextUp admin can disconnect everyone at once; and
  removing NextUp from Enterprise applications ends all connections.
- If you limit sign-ins by location (Conditional Access), allow NextUp's server address; we send
  it with this guide.

## Department claim and role seats

A person who signs in for the first time with the app role `NextUp.Leader` or `NextUp.Manager` can be
seated in NextUp's company structure straight away, so that cases routed to their role reach them. NextUp
finds the seat from the **department** in the ID token.

**How you emit it.** The `department` claim is not in an ID token by default. Add it with a claims
mapping policy that maps `user.department` to the `department` claim, and assign the policy to the app's
service principal (or, in the app registration, add an optional claim if your tenant offers `department`
there). Check it in a test sign-in: the decoded ID token must carry `"department": "Engineering"`.

**How NextUp uses it.**

- The value is compared, without regard to case, with the **name or key** of a unit in your structure
  (for example `Engineering` or `ENG`). The first matching unit counts.
- A **leader or manager** takes a seat in the unit's top role: the role that reports to nobody, or to a
  role of another unit (the lowest one in the list if there are several).
- A **member** gets no seat. Members get an anonymous handle instead.
- The seat is created once. A person who already holds a seat keeps it; NextUp never moves or removes it.

**Without the claim** (missing, empty or a department NextUp does not know) the account is created as
before, but has no seat. Such a person is seated later by the directory sync (DIR) or by an administrator.

## Directory sync

Only if you want it. NextUp can read your people from Entra ID, so that cases reach the right role holder
without anyone typing the structure in by hand.

- **Permission.** Under **API permissions → Add a permission → Microsoft Graph → Application permissions**, add
  **User.Read.All**, then **Grant admin consent for your organisation**. This is an application permission: NextUp
  reads as itself, not as a signed-in person, with the same client ID and secret as sign-in.
- **What NextUp reads**, per user: object ID, display name, work email, department, job title, manager, whether the
  account is enabled, and the personnel number (`employeeId`) when you fill it (for example from SuccessFactors or
  SAP HCM). The personnel number is used only to match people; it is never shown, logged or sent to the assistant.
- **What NextUp never reads:** absences, calendars, mail, files, groups, or any HR data beyond the fields above.
  NextUp never writes to your directory.
- **Departments.** A person is brought in when their **department names one of the org units** of your NextUp
  company (name or key, case does not matter). A department that matches nothing is skipped; add the unit first.
- **How often.** Every 15 minutes. The first run reads everyone, later runs read only what changed.
- **Switching it on.** In `https://<company>.sellux.ch/admin`, open the directory settings, choose Microsoft Entra ID
  as the source and switch the sync on. It needs the tenant ID to be set (step 6 above).

## What happens at sign-in

1. The person opens `https://<company>.sellux.ch` and chooses **Continue with Microsoft**.
2. Microsoft signs them in (with your MFA and Conditional Access) and returns a signed token for *your* tenant only.
3. NextUp checks the signature, your tenant ID and the role. A person who holds a role and is new gets a NextUp account;
   someone without a role is refused with "ask your IT administrator".
4. The NextUp session lasts eight hours. It does not follow your Conditional Access after sign-in.

The admin area (`https://<company>.sellux.ch/admin`) works the same way with the Admin role, and the name of the
administrator is shown in the header. Each Microsoft sign-in there is in the audit log. When Microsoft is not reachable,
the way in is a time-limited break-glass window that the host's operator opens with `stack/break-glass.sh`; every use of
it is logged. The shared admin code works on a demo stack only.

## If something does not work

| What you see | Usually |
|---|---|
| "belongs to another organisation" | the tenant ID in NextUp does not match the account's tenant |
| "NextUp is not open yet" | the company is still closed; only `NextUp.Manager` (and console admins) get in before **Open NextUp** |
| "has no NextUp role yet" | the person is not in a group that holds a role (step 4) |
| "isn't a NextUp administrator" | the Admin role is missing for that person |
| Microsoft says `AADSTS50011` | the redirect URI in step 1 does not match the address exactly |
| Microsoft says `AADSTS7000215` / `AADSTS7000222` | wrong or expired client secret (step 3) |
| Microsoft says `AADSTS90094` / needs approval | admin consent is missing (step 5) |
| Directory: "No Entra tenant ID is saved for this company" | the tenant ID is not saved in NextUp (step 6); save it under **Access** in `/admin`, then press **Run now** |
| Directory: "This server has no Entra app" | the client ID and secret (step 3) are not set on the NextUp server; whoever runs it adds them and restarts |
