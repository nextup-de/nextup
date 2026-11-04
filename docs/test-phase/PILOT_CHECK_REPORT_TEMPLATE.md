# Pilot check run report

Status: NOT RUN. Blank or unrecorded steps never count as passed.

## Run identity

- Run ID, date/time, owner, operator, security reviewer, customer contact:
- App SHA, images/digests, schema, plans SHA, configuration fingerprint and patch:
- Host size, database settings, timezone/clock, seed, browsers/devices:
- Enabled surfaces and justified exclusions (owner + server-side disable evidence):
- Prerequisites, access availability, planned dates and owners:
- Approved routing/AI thresholds, workload VUs/rates/duration and queue drain budget:
- Restricted evidence location, evidence owner and deletion date:

## Verdict

- Technical run: NOT RUN / PASS / BLOCKED / FAIL
- G4 pilot start: NOT REVIEWED / APPROVED / BLOCKED (Kevin, date, evidence)
- Counts: Pass / Weak / Fail / Not testable / Out of scope / Not run
- Open high findings (zero required), other findings, accepted exclusions:
- CI skipped/expected-failure tests and associated findings:

## Step evidence

Use one row per step. Result: Pass, Weak, Fail, Not testable, Out of scope or Not run.
Evidence identifies timestamp, SHA, actor role, redacted request/log/test and actual versus expected result.
Each compound step needs evidence for all its assertions. Scope exclusions need disable evidence.

| Step | Result | Expected and actual; evidence | Tester/time | Finding / next owner / due date |
|---|---|---|---|---|
| A1 | Not run | | | |
| A2 | Not run | | | |
| A3 | Not run | | | |
| A4 | Not run | | | |
| A5 | Not run | | | |
| B1 | Not run | | | |
| B2 | Not run | | | |
| B3 | Not run | | | |
| B4 | Not run | | | |
| B5 | Not run | | | |
| B6 | Not run | | | |
| C1 | Not run | | | |
| C2 | Not run | | | |
| C3 | Not run | | | |
| C4 | Not run | | | |
| C5 | Not run | | | |
| C6 | Not run | | | |
| C7 | Not run | | | |
| C8 | Not run | | | |
| C9 | Not run | | | |
| D1 | Not run | | | |
| D2 | Not run | | | |
| D3 | Not run | | | |
| D4 | Not run | | | |
| D5 | Not run | | | |
| D6 | Not run | | | |
| D7 | Not run | | | |
| D8 | Not run | | | |
| D9 | Not run | | | |
| D10 | Not run | | | |
| D11 | Not run | | | |
| E1 | Not run | | | |
| E2 | Not run | | | |
| E3 | Not run | | | |
| E4 | Not run | | | |
| E5 | Not run | | | |
| F1 | Not run | | | |
| F2 | Not run | | | |
| F3 | Not run | | | |
| F4 | Not run | | | |
| F5 | Not run | | | |
| G1 | Not run | | | |
| G2 | Not run | | | |
| G3 | Not run | | | |
| G4 | Not run | | | |
| G5 | Not run | | | |
| G6 | Not run | | | |
| G7 | Not run | | | |
| G8 | Not run | | | |
| G9 | Not run | | | |
| G10 | Not run | | | |
| G11 | Not run | | | |
| G12 | Not run | | | |
| G13 | Not run | | | |
| H1 | Not run | | | |
| H2 | Not run | | | |
| H3 | Not run | | | |
| H4 | Not run | | | |
| I1 | Not run | | | |
| I2 | Not run | | | |
| I3 | Not run | | | |
| I4 | Not run | | | |
| I5 | Not run | | | |
| I6 | Not run | | | |
| I7 | Not run | | | |
| I8 | Not run | | | |
| J1 | Not run | | | |
| J2 | Not run | | | |
| J3 | Not run | | | |
| J4 | Not run | | | |
| K1 | Not run | | | |
| K2 | Not run | | | |
| K3 | Not run | | | |
| K4 | Not run | | | |
| K5 | Not run | | | |
| K6 | Not run | | | |
| K7 | Not run | | | |
| L1 | Not run | | | |
| L2 | Not run | | | |
| L3 | Not run | | | |
| L4 | Not run | | | |
| L5 | Not run | | | |
| M1 | Not run | | | |
| M2 | Not run | | | |
| M3 | Not run | | | |
| M4 | Not run | | | |
| M5 | Not run | | | |

## G4 evidence outside the walkthrough

| Gate | Result | Evidence / owner / date |
|---|---|---|
| CI incl. DB/browser/brain eval | Not run | |
| M365 21/21, zero unauthorized sources | Not run | |
| Security cycle, no open high findings | Not run | |
| 14 real days of internal use | Not run | Start/end, diary, candidate changes and retest decisions |
| VM/load/recovery/on-prem drill | Not run | |
| Customer onboarding/support and launch prerequisites | Not run | |

## Findings and retest

For each: ID, severity, affected surface, reproduction, expected/actual, evidence, owner, fix SHA,
regression test and retest result. High includes access leak, data loss, broken clock/deadline,
main-path crash or p95 > 3 s per TST D7. The stricter p95 < 1 s launch budget still applies.
Any Must failure blocks regardless of finding severity. Never downgrade a finding to obtain a pass.
A fix changes the candidate: record impacted-step retests and final required CI on the final SHA.

## Six-week pilot agreement and G5

- Customer, Kevin/Marc, dates, eligible population and baseline window:
- Metric definitions, source, numerator/denominator, suppression, targets:
- Weekly aggregate reviews, incidents, stop trigger owner and communication contact:
- G5 continue / revise / stop: decision, date and supporting outcome evidence:

## Cleanup

- Temporary grants/accounts/tokens, tunnel, tickets, queued mail and credentials handled:
- Redacted evidence retained; restricted artifacts scheduled for deletion:
