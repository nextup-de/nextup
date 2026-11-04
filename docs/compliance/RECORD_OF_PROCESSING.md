Updated 2026-11-04 · Draft for legal review, not legal advice.

# Record of processing activities (Art. 30(2) GDPR) — NextUp as processor

One record per customer; the fields in brackets are filled in per customer.

## Processor and controller

| Field | Entry |
|---|---|
| Processor | **[NextUp operator, address, contact, data protection contact]** |
| Controller | **[Customer, address, representative, data protection officer]** |
| Sub-processors | `SUBPROCESSORS.md` |

## Categories of processing carried out for the controller

| Activity | People | Data | Where it happens |
|---|---|---|---|
| Raising and routing cases and ideas | Employees, leaders, managers | Name, role, unit, handle, case text, events, route proposals | The company's stack: app and database |
| Sign-in | All members | Login-code hash, sealed second-factor secret (managers), Entra or SAML identifiers, session epoch | App and database; Microsoft or the customer's SAML provider sign the person in |
| Directory sync (SCIM, SuccessFactors) | Employees in the customer's directory | Name, email, unit, manager, active flag, personnel number (never returned by SCIM) | `src/server/scim`, `features/directory` |
| Assistant and routing proposals | Employees who ask | Masked question text and knowledge snippets; AssistTurn rows with sources and counts | The stack; a model provider only when the company chooses it |
| Notifications | Recipients of cases | Address, subject, text | The mail relay set in `SMTP_URL` |
| Metrics | Managers (aggregates only) | Counts per unit or role with at least 5 people; no person ranking | The stack |
| Audit log | Admins, NextUp support, system | Who, what, when, changed fields without names or secrets | The stack; optionally a syslog receiver of the customer |
| Bug reports | Reporters | Text and an optional screenshot | The stack; sent to NextUp when `OPS_URL` is set |
| Backups | All data | Encrypted restic snapshots | Host and the off-box target |

## Transfers to third countries

None by default. Only through a sub-processor chosen for the stack (see `SUBPROCESSORS.md`); the safeguard is
recorded per customer: **[ ]**.

## Retention

| Data | Period |
|---|---|
| Assistant turns | Company setting, 7 to 730 days; default 90 |
| Idea drafts | 30 to 730 days after the last change; default 180 |
| Closed cases | Off until set; 360 to 3600 days |
| Audit log | 730 days, fixed |
| Export files | 7 days |
| Backups | Per the restic policy of the stack (`docs/ops/RPO_RTO.md`) |

## Security measures

`TOMS.md`.
