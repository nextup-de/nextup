# Onboarding: what your IT, HR and pilot lead prepare

> **Updated 2026-11-04.** For the customer: IT, HR and the person who leads the pilot. NextUp sets up the first pilots
> *with* you, not for you and not by leaving you alone with a manual. This page says what to prepare, who does what, and
> how long it takes. Nothing here is legal advice; the data protection papers are drafts for your own review.

## What a pilot is

One stack of NextUp for your company, on its own server. People raise a problem or an idea, it goes to the role that owns
it, that role answers within a promise (five working days unless you set another), and a deputy takes over when it is
missed. A weekly report shows whether that works, against the time before. The pilot runs for six weeks in the stage
*pilot*. Before that your company is in *sandbox*: real people, but nothing is sent.

## Who does what

| Who | Does | Time |
|---|---|---|
| Pilot lead (one person who knows the units and routes) | the units, roles, routes; who is whose deputy; joins the setup session; leads the training | about 2 days in total before, 1 hour a week during |
| Customer IT | VM or access to one, DNS, mail relay, sign-in (Entra), directory, firewall | see below |
| HR | the people list and the works council | see below |
| Your data protection officer and legal signatory | read and sign the data protection pack | your own timing |
| Works council (where you have one) | the works agreement | your own timing, often weeks |
| NextUp | installs the stack, runs the import in sandbox, joins the setup session, supports the pilot | none on your side |

## What to prepare

### 1. Sign-in: Entra, SuccessFactors or a file

Choose how your people get in and where the people list comes from.

- **Microsoft Entra ID** (recommended if you use Microsoft 365). Follow `docs/customer/ENTRA_SETUP.md`: about twenty
  minutes in the Entra admin center. You decide who gets in, and in which role, in Entra. NextUp never asks for a
  password. Optionally Entra also supplies the people list (directory sync, same document).
- **SAP SuccessFactors** for the people list. Follow `docs/customer/SUCCESSFACTORS_SETUP.md`. Plan several weeks for the
  technical API user and the works council: the connection is switched on only after the agreement is in place.
  Sign-in is still Entra or another single sign-on (`docs/customer/SSO_SETUP.md`).
- **CSV files** if you use neither, or want to start small. Four files (below). People then get a login code, handed over
  through a channel your IT trusts.

You can mix them: for example Entra for sign-in and CSV files for the structure.

### 2. The four files

| File | One row is | Main columns |
|---|---|---|
| `units.csv` | a unit (site, department, team) | `key`, `name`, `kind`, `parent_key`, `headcount` |
| `roles.csv` | a role (a desk someone sits at) | `unit_key`, `title`, `reports_to_unit_key`, `reports_to_title`, `seats`, `spend_limit_eur`, `decides` |
| `members.csv` | a person | `name`, `email`, `department`, `app_role`, `language`, `seat_unit_key`, `seat_role_title` |
| `routes.csv` | a kind of problem and who owns it | `key`, `keywords`, `owner_unit_key`, `owner_role_title` |

Every role needs a seat, every route needs an owner role with a person in it, and every unit with fewer than five people
is hidden in the report, so do not worry if some teams are small. NextUp checks all four files before it writes anything
and lists every error at once, so a first attempt with mistakes costs nothing. A set of example files can be produced
for you to look at.

### 3. Data protection pack

NextUp gives you drafts to read and to adapt with your own legal people. They are written from what the software does;
where it does not do something a template usually promises, the document says so. None of them is signed or reviewed
by a lawyer. They are in `docs/compliance/`:

- the data processing agreement (Art. 28 GDPR), its technical and organisational measures and the list of subprocessors;
- the record of processing and the data protection impact assessment, for your data protection officer;
- a works agreement template, if you have a works council;
- the VDA ISA self-assessment, if your security team asks for it.

Not provided today: a certification (TISAX, ISO 27001), 24/7 operation, high availability, an outside penetration test.
`docs/customer/SECURITY_GUIDE.md` explains the data flows, the encryption and who can reach what, for your IT security.

If the AI is switched on, the AI provider's own data processing agreement is signed before any text leaves your server.
For the pilot the AI is off unless you and NextUp decide otherwise; everything works without it.

### 4. Server and mail

- **Hosted by NextUp:** you need a name in your DNS for the address your people will use, and a mail relay NextUp may send
  through (or NextUp's, if you agree). Nothing else.
- **On your own server:** a Linux VM as in `docs/customer/INSTALL.md`, with an S3-compatible bucket for backups.
- Your mail team allows the sender address and knows that the first mails come from NextUp.

### 5. Calendar

Which weekdays are workdays and which holidays count (German federal, or federal plus Bavaria, or your own list). The
promise and the deputy hand-over run on working days.

## Timeline

A typical order. The weeks are a plan, not a promise; the long items are agreements and the works council, not software.

| When | What |
|---|---|
| Week 0 | Kick-off call. Choose sign-in and people source. Name the pilot lead and the IT contact. Send the data protection pack to your legal and data protection people. |
| Weeks 0 to 3 | IT: DNS, mail relay, Entra registration (or the SuccessFactors API user). HR: people file. Pilot lead: units, roles, routes. Works council talks, if any. |
| Week 3 or 4 | NextUp installs the stack and runs the import in sandbox from your files. You receive the list of what is still open. |
| Joint setup session | Half a day, see below. |
| Pilot week 1 | Training for staff and managers (30 minutes, `docs/pilot/TRAINING.en.md`), switch to pilot, first-week checks. |
| Pilot weeks 1 to 6 | The weekly report every Monday; a short review with NextUp each week. |
| After week 6 | Review against the success measures; you and NextUp decide: stop, extend, or move to live. |

## Joint setup session

NextUp sets up the first pilots together with you. In one session of about half a day the following people sit down
together, in person or on a call.

**Who attends**

- **NextUp:** the operator who installed the stack and ran the import, and Kevin or Marc for the decisions.
- **Your IT:** the person who connected sign-in, mail and the directory and can change DNS, the relay and Entra.
- **The pilot lead:** the person who knows the units, the roles and the routes and can say who is whose deputy.
- Your legal signatory or data protection officer, or a clear written statement from them, for the agreements.
- Your admin: the person who will switch the company from sandbox to pilot. They move the stage; NextUp does not.

**What each brings**

| Who | Brings |
|---|---|
| NextUp | a company in sandbox imported from your files; the output of the checks; the restore test result; the hand list; a test route and a test case; no open support access |
| Your IT | the Entra or SuccessFactors setup done as in the handout; the mail relay working; an address that can receive a test mail; the person who can fix DNS, firewall or sign-in during the session |
| The pilot lead | the units, roles and routes as the people in them would say them; the deputies; three real example problems for the test case |
| Your legal or data protection contact | the signed data processing agreement, the works agreement if there is a council (or the status of both, in writing) |

**What is checked**

1. By hand, first: the agreements, the works council, the restore test, NextUp's open security findings and any access
   left open. A green checklist in the app does not authorise a pilot; it cannot see a signature or a council decision.
2. Structure: the Org page reads like your company.
3. Routes: every route has an owner and a deputy, and the pilot lead agrees with them.
4. Sign-in: an admin, a manager and a member sign in; someone without a role is refused.
5. One real test mail arrives where it should.
6. A test case: raised, routed, answered, in the decision log.
7. The Go-live checklist, line by line, in the app: every needed line is done.

**What the session ends with**

Either a decision to switch, taken by your admin on the Go-live page with everyone watching, or a written list of what is
missing, who does it and by when. Both are valid ends. Nobody switches under pressure from the calendar. The session also
ends with the names of the contacts for the pilot (`docs/pilot/SUPPORT.md`) and the date of the first training.

## During the pilot

- Support: `docs/pilot/SUPPORT.md`. You grant NextUp access to your data only for the time you choose, and can end it.
- The report: `docs/pilot/SUCCESS_METRICS.md` explains every number.
- You can switch back to sandbox at any time. Nothing is deleted by that.

## What we ask from you

Honesty about what is not ready, one pilot lead with time, and a written stop rule that you and NextUp agree before the
start. What we do not ask: personal data beyond the people list, access to your Microsoft 365 content, or any change to
your directory. NextUp only reads, and only the fields named in the handouts.
