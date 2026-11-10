# Block S: ready for a first customer

> **Plan · 2026-11-11 · in progress.** Block S of the
> [build plan](https://github.com/nextup-de/nextup-context/blob/main/plans/2026-11-11_process-build-plan.md):
> the 14 steps of charts P8 (provisioning), P9 (company setup) and P10 (operations) that are decided and not built,
> plus the 27 open edge points of their chapter notes, decided below. Milestone
> [S · Ready for a first customer](https://github.com/nextup-de/nextup/milestone/1), issues #654–#668.

## Why

A first customer needs four things the product does not do today: a stack whose console opens with Microsoft without
break-glass, an AI choice that keeps everything on their stack, a record of what they signed and what they chose not to
use, and texts that tell them about releases, incidents and the end of the contract. None of it is large; together it
is what stands between "the software works" and "a plant can be opened".

## The steps

| Issue | Step | Kind | Lane | PR |
|---|---|---|---|---|
| #655 | Q8.5 · `install.sh --entra-tenant-id`, copied into the new company row once, audited with actor `install` | code | Kevin | install |
| #656 | Q8.1 · A stack starts with no person: Entra roles create the people; without Microsoft the bootstrap. Docs and a test, no new code path | docs + test | Kevin | install |
| #660 | Q8.6 · Hand-over: customer IT confirms on `/admin/setup` (`audit.setup.handed_over`); the console's Microsoft sign-in writes `audit.access.console_signin` | code | Kevin | install |
| #657 | Q8.4 · Fifth AI choice "model on this stack": no endpoint, no key, no DPA date; every call goes to the stack's brain | code | Kevin | ai-local |
| #661 | Q9.1 · "We do not use this" with a reason on each optional setup line (`audit.connector.declined`, `audit.connector.reopened`); never blocks Open | code | Kevin | go-live |
| #662 | Q9.4 · Agreements card on Settings → Go-live (`audit.company.agreement`), a needed check that blocks Open; the Privacy line renamed "AI provider's agreement" | code | Kevin | go-live |
| #667 | Q10.13 · An export row marked as delivered (`audit.privacy.delivered`) | code | Kevin | export |
| #658 | Q8.8 · AI choice on the order form, next to hosting | text | Marc | texts |
| #663 | Q9.3 · Teams bot handout for the customer's tenant (`docs/customer/TEAMS_SETUP.md`) | text | Marc | texts |
| #664 | Q9.8 · Announcement text for the opening day (in the training guide) | text | Marc | texts |
| #665 | Q10.1 · Release mail 2 working days before, and the live mail | text | Marc | texts |
| #666 | Q10.8 · Incident mail; owners named by Kevin (Q10.7) | text | Marc, Kevin | texts |
| #668 | Q10.20 · Contract-end runbook and the deletion statement (Q10.21) | text | Marc, Kevin | texts |
| #659 | Q8.8 · Our cloud model: AWS DPA signed, EU routing in writing | signature | Kevin | – |

Four code PRs (install, ai-local, go-live, export) touch different areas and are built side by side, each off `main`.
They all add audit actions to `features/audit/index.ts`; whoever merges second resolves that list by hand. Migrations,
if any, use distinct timestamps (install `20261211…`, ai-local `20261212…`, go-live `20261213…`, export `20261214…`).
The texts are one PR for Marc to read before they go to a customer.

## The 27 edge points, decided

Taken by recommendation as Kevin asked on 10 Nov, unless marked **Kevin**. "In S" means it is built or written in
this block; "later" names where it goes.

### Chapter 8 · Provisioning

| Id | Decision | Where |
|---|---|---|
| Q8.2 | A machine account with one read-only registry token per host, 90 days; a signed image tarball per release for a VM without outside access. Kevin's personal token is never handed out. | G4 install drill (ops), not app code |
| Q8.3 | Alerts of a customer-hosted stack go to both: the customer's IT list and NextUp's topic; the heartbeat in NextUp's account; the customer may strike NextUp out, written on the hand-over sheet. | hand-over sheet in S |
| Q8.7 | Break-glass on a VM NextUp hosts: only for a ticket, ticket number as the reason, customer IT told before and sent the log after, written in the DPA annex. **Kevin** (a commitment in the DPA). Recommendation stands until he says otherwise. | DPA annex text in S |
| Q8.9 | No several companies on one stack for real data; plants are units. | settled, docs |
| Q8.10 | One command `stack/provision/new-customer.sh` chaining the existing scripts: 4 manual steps hosted, 6 on their VM. | G4 install drill, after S |
| Q8.11 | Secrets reach a hosted stack by a one-time link from the password manager, read with `read -rs`; never mail. | hand-over sheet in S |
| Q8.12 | The Teams bot is single-tenant in the customer's tenant, from a handout. | = Q9.3, texts in S |

Also in the install PR: `install.sh` prints the admin code only on demo and on a real stage says to open a window with
`stack/break-glass.sh` (contradiction 1); INSTALL.md, `stack/README.md` and `install.sh --help` say the stack creates
the company at first start (contradiction 2); INSTALL.md names 4 vCPU / 16 GB / 160 GB (contradiction 3).

### Chapter 9 · Company setup

| Id | Decision | Where |
|---|---|---|
| Q9.2 | SuccessFactors values are entered by the customer's IT in `/admin` with NextUp on the call; support stays read-only. Fix SUCCESSFACTORS_SETUP.md §6. | texts in S |
| Q9.5 | No console-less multi-tenant customers: from sandbox on every customer runs on its own stack. | settled |
| Q9.6 | A warning before a secret or token expires (date asked when saved, 30 and 7 days before). The first pilot runs six months and Entra secrets last up to 24, so it is not needed for go-live. | later, after the pilot (with Q10.10, Q10.11) |
| Q9.7 | Reminders and the digest are recommended for Open and needed for the move to pilot, because the promise and the deputy hand-over depend on them. | go-live PR in S |

### Chapter 10 · Operations

| Id | Decision | Where |
|---|---|---|
| Q10.2 | On the customer's server Kevin approves a release only after their IT agreed to the window; no reply, no release. | release mail text in S |
| Q10.3 | A pin is agreed with an end date of at most 30 days; a security fix ends it early; the customer is told 2 working days before the unpin. | release mail text in S |
| Q10.4 | Restore time: 1 h stays the test limit, customers are told 4 h in business hours; first reply to severity 1 stays 1 h in working hours. **Kevin**: open since 9 Nov in nextup-context `decisions/2026-11-09_restore-time.md`. The texts use the recommendation until he decides. | Kevin |
| Q10.5 | Before a real restore, save the audit rows newer than the snapshot; the incident lead mails the snapshot time and what is lost; a company admin repeats each erasure the same day. | incident text in S |
| Q10.6 | = Q8.3. | hand-over sheet in S |
| Q10.7 | Support owner, incident lead, deputies, hours 09:00–17:00 Europe/Berlin on working days, a phone for severity 1. **Kevin** names the people; SUPPORT.md says the first pilot does not start before. | Kevin |
| Q10.9 | = Q8.7. | Kevin |
| Q10.10 | Expiry warnings for the Entra secret and tokens. | later, with Q9.6 |
| Q10.11 | A renewed Entra secret: the operator re-runs `install.sh` with the secret the customer sends on a trusted channel. | runbook in S |
| Q10.12 | Names and mails that do not come from the directory are edited in Members, audited. | later (block D, with Q10.17) |
| Q10.14 | The erasure dialogs and the admin's reply name what stays: free text, append-only events, copies outside NextUp, snapshots for about 6 months. | later (privacy texts with block D) |
| Q10.15 | A failed retention run shows on Data and privacy; after two failed nights the health report turns "warn". | later (G4 ops track) |
| Q10.16 | A seat nobody holds tells the company admins at once (`org.seat.vacant`). | later (block G, absence) |
| Q10.18 | A leaver's ideas go on; the raiser shows as inactive and gets no notices; an anonymous raise keeps its handle. Check that `main` does this; fix in S only if it does not. | go-live PR checks it |
| Q10.19 | After the end date the stack stays up 30 days for company admins only; invitations and mails stop on the end date. | runbook in S |
| Q10.21 | The deletion statement to the customer's DPO, each item with date and who did it, signed by Kevin within 5 working days of day 30. | runbook in S |

Also in the texts PR: DPA_TEMPLATE.md §7 (no admin deletes the company: the stack is destroyed, Q10.20), §10 (backups
pruned with the stack), §9 (a breach is reported within 72 h of NextUp learning of it, the legal limit).

## Done when

- The four code PRs are merged: contract and actions with unit and database tests, pages on the setup and go-live
  screens, seeds and demo updated, reference docs (ADMIN.md, SETTINGS.md, INSTALL.md, AI_PROVIDER.md) in the same PR.
- The texts PR is merged after Marc read it.
- Kevin named the support owners (Q10.7), signed the AWS DPA (#659) or chose not to offer our cloud for the first pilot,
  and decided the restore time.
- The boxes of P8, P9 and P10 are redrawn white in Paper.
