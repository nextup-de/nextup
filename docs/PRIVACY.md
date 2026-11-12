# Privacy: audit, export, pseudonymise, retention

What NextUp records about admin actions, what a company or a person can get out, what happens when a person
leaves, and how long things are kept. This is the description of what runs on `main` for a non-demo company
(phase GDP). Where it says "planned", it does not run yet. Pages: Settings → Data and privacy
(`/<company>/settings/privacy`), Settings → Audit log (`/<company>/settings/audit`), Settings → Members.
All of them are for company admins only; everyone else gets "not found".

## Audit log

Every change an admin, the NextUp team or the system makes to a company is written to `AuditEvent` in the same
transaction as the change. The log is append-only. It lists actions, never a ranking: it does not sort or count by
person, and filtered to one person it shows no total.

The actions (`AUDIT_ACTIONS`, `src/features/audit/index.ts`), by area:

| Area | Actions |
|---|---|
| company | created, stage moved, saved |
| settings | rules, calendar, org, routing, goals, areas, import, export, notifications, webhooks, metrics baseline |
| member | added, invited, login code issued, role, deactivated, reactivated, deleted, seat, second factor reset |
| token | API token created, revoked |
| connector | saved, switched on, switched off, secret set or replaced, removed, disconnected |
| assistant | assistant settings saved, idea settings saved |
| directory | switched on, switched off, run, SCIM |
| access | break-glass code used, Entra tenant, stack admin, support access granted, revoked, sign-in, extended |
| privacy | exported, downloaded, marked as delivered, pseudonymised, retention changed, retention run, screenshot switch, audit log exported |

An entry holds when, the actor kind (`admin`, `console`, `break-glass`, `support`, `platform`, `system`,
`directory`, `api-token`) and the person if there is one, the action, the target, and the changed fields with
before and after. A change never holds a name or an email, and a secret only as set, replaced or removed.

Who reads it: company admins, in the audit view (newest first, 50 per page; filters by period, area, actor kind and
one person) and as CSV (the export itself is audited). Entries are kept 24 months (730 days, fixed).

## Export

Company admins request an export in Data and privacy (the whole company) or in a member's ⋯ menu → Export data…
(one person). The file is JSON, one object per table, ids kept, dates ISO. It is built at once, kept for **7 days**
and then deleted; the row stays as "Expired". Every request and every download is audited.

**Company export** holds: the company (no secrets), structure, rules, calendar, people (without personnel number and
sign-in data), every case event, case views, assistant turns (masked text as stored), published ideas, tickets
without screenshot bytes, integrations without sealed values, the audit log, retention and privacy settings. It
leaves out: idea drafts that are not published, idea turns, login codes, second-factor secrets, keys.

**Person export** holds: the person's profile, seats, events they wrote, cases they raised, bug reports with
screenshots, mail settings, connections (provider and dates only), audit entries by or about them. When the file goes
to the person it also holds their assistant turns, idea drafts and idea turns; an admin's copy leaves those
private items out. Other people's names and emails are not in it.

Who gets the file:

- **To the person** (active, with a verified address): they get a mail (`privacy.export`, in their language, skipped
  for sandbox companies) that links to a page in the app, never to the file; they sign in and download.
- **Admin-only copy**: the requesting admin downloads it. For a member who is deactivated this is the only choice;
  it is labelled admin-only, the reason is recorded in the audit log, and it is **not delivery to the person and not
  the fulfilment of their request** by itself.

**A former member gets their data through the company, never from NextUp** (Q10.13). They cannot sign in, and
NextUp has no download for anyone who is not a member. The steps:

1. A company admin makes the admin-only copy (Members → ⋯ → Export data…) and downloads it.
2. The company hands it over through its own channel: HR, the data-protection officer, its usual secure transfer.
3. A company admin opens Data and privacy → Exports and clicks **Mark as delivered** on that row, with an optional
   note of the channel ("by HR, 12 Nov"; no addresses or other personal details). Any company admin may mark it,
   not only the one who downloaded it.

The button shows only on an admin-only copy of one person that was downloaded at least once. A row is marked once
and the mark cannot be undone; the row then shows the date, the admin and the note. The mark and its audit entry
(`audit.privacy.delivered`: export id, date, note; the person as target; area Data protection in the audit view)
commit together. The mark stays on the row after the file expires. A copy NextUp mailed to an active member
and a company export cannot be marked.

Events in an export show the actor from the person's current identity, never a stale display name stored with the
event.

## Pseudonymise

For a person who has left: deactivated, holding no seat, not the admin themselves. The admin types the name to
confirm; this cannot be undone.

What changes (structured identity): the name becomes "Former member #n" (random number unique in the company), email,
initials, line, department, login code and the Entra and employee ids are cleared, seat holder names and "updated
by" fields resolve to the pseudonym. Their assistant turns, unpublished drafts, connections and mail settings are
deleted, and so are their Teams link and the notices addressed to them. Their earlier exports expire. Members
list, audit view and exports then show the pseudonym.

**Names on old events:** the stored event keeps what it was written with. What leaves the server (browser, API,
new notices) carries the pseudonym wherever the event says who it means by user id or by a vacated seat.

**They stay gone:** a directory page never changes a pseudonymised person, and reactivating is refused. Their
source ids and email are kept as hashes (`ExternalIdentity`, provider `former`), so Graph, SuccessFactors or SCIM
cannot make a new person of them either, and a Microsoft sign-in creates no new account for them. Their SSO and
SCIM links stay, so a sign-in still finds the inactive account and is refused. Deleting the person removes the hashes too.

What stays, on purpose: case events are append-only and are never rewritten, so event ids, types, order and days
stay and still point at the person's user id, shown through the pseudonym. The anonymous **handle** stays, so an
anonymous raise does not become attributable. Bug reports keep their reporter id. Delete remains possible afterwards.

**Limit:** pseudonymising does not scrub arbitrary authored text. A comment, a case title or a body that contains
the person's name, or another person's comment that mentions them ("Thanks Lena Brandt"), keeps that text. NextUp
does not search or rewrite free text. Copies outside NextUp (mails sent, Jira, Teams, earlier exports) are not
changed. Do not read this as erasure of every mention.

## Retention

Set in Data and privacy, per company, as `RetentionRule` rows. Without a rule the default applies.

| Kind | Limits | Default |
|---|---|---|
| Assistant turns | 7-730 days | the company's assistant retention (90 days) |
| Idea drafts (status draft; days after the last change) | 30-730 days | 180 days |
| Closed cases | 360-3600 days (entered in months, 1 month = 30 days) or keep | keep |
| Audit log | fixed | 730 days (24 months), no setting |
| Finished notices (sent, failed, skipped) | fixed | 90 days, no setting; pending ones stay |
| Teams link of someone inactive | fixed | removed at the next run; it comes back when they write to the bot |

Closed cases: when a rule is set, the events of every case that is closed and whose newest event is older than the
limit are deleted, with its case view. Cases without a case view (seed data) are untouched. Metrics lose them.

The run is daily: a company that is not a demo runs once after 03:00 server time (the scheduler checks hourly),
also removes expired export files, and writes one audit entry with the totals when anything was removed.

## Screenshot switch

One switch (Data and privacy → Screenshots, default on): whether bug reports may carry a screenshot. The report and
its screenshot go to the NextUp support team. Screenshots attached when raising a case stay in the person's
browser; only their count is stored.

## Handles for Entra-created users

A person created by the Microsoft sign-in (just-in-time), by the directory sync, or added in Members gets an
anonymous handle like any other member (IDN-C1, DIR-A1, Members). This belongs to the identity phase; GDP builds
nothing for it (gap G-046 stays with IDN).

## GDP gaps

From `docs/audit/gaps/product.md`, phase GDP:

| Gap | Was | Answered by |
|---|---|---|
| G-041 | Admin actions only in the console | GDP-A1, GDP-C1, GDP-K1 (audit log, its writers, console and API actions) |
| G-042 | No data export | GDP-X1 (company and person export) |
| G-043 | No person deletion or pseudonymisation | GDP-P1 (pseudonymise) |
| G-044 | No retention for events and drafts | GDP-R1 (retention rules and run) |
| G-045 | Person rankings in metrics, dashboard and /people | moved to MET (and TRUTH-A1/B1 of the defensible-offer plan); those files belong to MET |

## Claims

The landing page (`nextup-landing`, a separate repo, not changed by GDP) and `docs/SECURITY.md` make claims about
export, deletion, retention and audit. Checked against `main` for a non-demo company:

| Claim | Status |
|---|---|
| Landing pricing: "Export of everything at any time" | **holds since GDP**, with the scope above: company and person JSON, not secrets, personnel number or others' private drafts. "Everything" overstates it; say "export of your company's data". |
| Landing privacy: "exported and, on request, deleted at any time" (de: "jederzeit exportiert und auf Wunsch gelöscht") | **holds since GDP** for export, for a whole company (delete) and for a person (pseudonymise or delete). Pseudonymising does not scrub free text, so it is not an erasure of every mention. |
| Retention: rules for assistant turns, drafts and closed cases | **holds since GDP**, defaults above; case retention is off until set. |
| Audit: who changed what in a company | **holds since GDP**, for admin, console and system actions, 24 months. |
| "Never people" / no per-person performance figures | **still planned**: person rankings exist (G-045), answered in MET. |
| `docs/SECURITY.md` item 4 (audit log) and item 7 (export and deletion) | **hold since GDP**; the processing record, DPA per customer and backup encryption in item 7 are **still planned**. |
