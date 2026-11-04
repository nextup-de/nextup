# Pilot package

> **Updated 2026-11-04.** Plan PIL, task PIL-P1. The documents the team and the first pilot customer need: onboarding,
> training, support, runbook, success measures and the offer. They describe only what runs on `main` for a company that is
> not a demo; anything else says *planned for the pilot*. Nothing here is legal text that has been reviewed.

## The documents

| File | For | What it is |
|---|---|---|
| [RUNBOOK.md](RUNBOOK.md) | NextUp's operator | from an empty VM to stage pilot, in order: install, config, bootstrap, the joint setup session, the switch, rollback, first week, weekly numbers, live |
| [ONBOARDING.md](ONBOARDING.md) | customer IT, HR, pilot lead | what to prepare, Entra or SuccessFactors or CSV, the data protection pack, who does what, a timeline, the joint setup session |
| [TRAINING.en.md](TRAINING.en.md), [TRAINING.de.md](TRAINING.de.md) | staff, desk holders, managers | 30 minutes: raise, answer on time, deputy, reminders; no person metrics |
| [SUPPORT.md](SUPPORT.md) | customer and team | channels, severity, response targets, who owns support and incidents, support access through the customer's grant |
| [SUCCESS_METRICS.md](SUCCESS_METRICS.md) | Kevin, Marc, customer | the pilot criteria mapped to the report's numbers, what counts as a pass, the small-unit rule |
| [ONE_PAGER.md](ONE_PAGER.md) | a customer | the pilot offer; the price is a marked place for Kevin |

## What is ready

- The install path for a customer stack and its backups (`docs/customer/INSTALL.md`, `docs/customer/OPERATIONS.md`).
- Sign-in and directory handouts for the customer's IT (`docs/customer/ENTRA_SETUP.md`,
  `docs/customer/SUCCESSFACTORS_SETUP.md`, `docs/customer/SSO_SETUP.md`).
- The bootstrap: a sandbox company from a config and four CSV files, with `--dry-run`, an optional `--codes` file and the
  go-live checks at the end (`apps/app/prisma/generators/pilot/README.md`).
- The Go-live page (`/<company>/settings/go-live`), the Pilot report (`/<company>/settings/pilot-report`) and the weekly
  mail to the chosen managers.
- Drafts of the data protection pack (`docs/compliance/`), written from the code. They are drafts for legal review.
- Sizing and the AI provider choice (`docs/ops/SIZING.md`, `docs/ops/AI_PROVIDER.md`).

## What is Kevin's and Marc's

Nothing below is done by a document, a script or a green checklist. A green checklist does not authorise a pilot.

- **The contract** and the **data processing agreement**, signed by both sides, and the AI provider's agreement if the AI
  is on.
- **The works council** agreement, where the customer has a council. It comes from the customer; NextUp supplies the
  template.
- **The external penetration test** and the handling of its findings. None is done.
- **Two weeks of internal real-time use** without a data-loss or access bug, as the master plan's test-phase gate asks.
- **Price and terms** (`ONE_PAGER.md`), **service levels** and the **support people** (`SUPPORT.md`): every one is marked
  *KEVIN: fill in* and stays visibly undecided.
- **The findings revision (D15).** After TST, Kevin rereads the plan against TST's final findings, the VM sizing and the
  open security, privacy and availability issues, and records for each finding: fixed, deferred with an owner and a date,
  or a blocker. A merged TST task or an auto-passed gate does not replace this. The step before the first pilot waits for it.
- **The hand checks in the joint setup session**: signed agreements, works council, restore test, open TST findings and
  residual access (`RUNBOOK.md`). There is no evidence file and no check in the app for them.

## TST's lower findings

The default for a lower finding is no code fix in PIL. That is not the same as accepting a risk for a customer: the customer
is told what is open. The findings are in `docs/test-phase/findings/`; read them next to this package:

- [TST-L1](../test-phase/findings/TST-L1.md): load. One Node process stops gaining throughput at roughly 10 to 15 requests
  per second on the developer PC; pages get slow, they do not fail. The 2,000-account run on the test VM is not recorded
  in `docs/ops/SIZING.md` yet. Do not promise a response time to a customer before it is.
- [TST-S1](../test-phase/findings/TST-S1.md), [TST-C1](../test-phase/findings/TST-C1.md),
  [TST-I1](../test-phase/findings/TST-I1.md): scenarios on the core loop, channels and integrations; none found a product bug.
- [AIT-Z1](../test-phase/findings/AIT-Z1.md): AI quality. With the AI off none of it applies.

The list of lower findings that TST keeps for later is not on `main` in this branch; link it here when it lands.

## Where to start

- The operator: [RUNBOOK.md](RUNBOOK.md).
- The customer: [ONBOARDING.md](ONBOARDING.md), then the training.
- A new customer enquiry: [ONE_PAGER.md](ONE_PAGER.md).
