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

We set the tenant in your NextUp admin and install the client ID and secret on your stack. Then we test with you:
first an Admin, then a Member.

## What happens at sign-in

1. The person opens `https://<company>.sellux.ch` and chooses **Continue with Microsoft**.
2. Microsoft signs them in (with your MFA and Conditional Access) and returns a signed token for *your* tenant only.
3. NextUp checks the signature, your tenant ID and the role. A person who holds a role and is new gets a NextUp account;
   someone without a role is refused with "ask your IT administrator".
4. The NextUp session lasts eight hours. It does not follow your Conditional Access after sign-in.

The admin area (`https://<company>.sellux.ch/admin`) works the same way with the Admin role, and the name of the
administrator is shown in the header. An access code for the admin area stays available as a way in when Microsoft
is not reachable. Every use of it is logged.

## If something does not work

| What you see | Usually |
|---|---|
| "belongs to another organisation" | the tenant ID in NextUp does not match the account's tenant |
| "has no NextUp role yet" | the person is not in a group that holds a role (step 4) |
| "isn't a NextUp administrator" | the Admin role is missing for that person |
| Microsoft says `AADSTS50011` | the redirect URI in step 1 does not match the address exactly |
| Microsoft says `AADSTS7000215` / `AADSTS7000222` | wrong or expired client secret (step 3) |
| Microsoft says `AADSTS90094` / needs approval | admin consent is missing (step 5) |
