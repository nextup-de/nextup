# TST-I1 findings

Integration scenarios on a fresh Musterwerk (150 people, 2 weeks, seed 11), `apps/app/tests/db/tst-integrations.test.ts`.

## Result

No product bug found; no `it.fails` and no TST-F finding. All seven scenarios pass as normal tests, each switching on only what it tests:

- Jira (fake, Cloud): a case decided yes with a project becomes an epic with the step as a child; a human's move and comment on the fake come back as `project.*` events by `system:jira`; `workTrackerFor` answers `jira-cloud`.
- Microsoft 365: the 21 recorded questions pass `checkGroundTruth`, each person's search using only their own Graph token. Checked again independently with `canRead`: no hit is a file the persona's groups may not read.
- API v1: a token reads the cases and creates one routed to the route; the same `externalId` again answers 200 with the first case and writes nothing; no token answers 401.
- Webhook: a subscription from the settings action gets one signed `case.raised` for a raise; the signature verifies with the secret; a second pass sends nothing more.
- SCIM, OIDC, SAML: SCIM provisions a person who signs in through both as one user id; a SCIM deactivation refuses the next OIDC and SAML sign-in (`sso_error=inactive`) and sets no session.
- SuccessFactors (recorded pages, Q3): the full read adds 4 people, leaves the other people active, and asks only SAP's host.
- All integrations off (D3): raise, route, answer and decide still pass; no outside call is made; SCIM refuses; no webhook is pending or sent.

## Notes for whoever writes the next scenario (not defects)

- The generator makes a `sandbox` company. These scenarios move it to `pilot` and set `entraTenantId` first.
- SCIM needs `department` to name an existing unit of the company, else 400 "The department does not match a unit of the company."
- SuccessFactors skips a person whose department unit is not in the company. The scenario creates the units `Produktion`, `Einkauf` and `Altes Lager` the pages name; without them `added` is 3, not 4.
- With webhook sending off the dispatcher still writes the outbox row, as `skipped`, and sends nothing. The scenario asserts that, not an absent row.
- The webhook page only takes https; the scenario points the stored subscription at a local http receiver, as API-Z1 does.
