# Build plans: a copy for reading

> **Updated 2026-11-02 (afternoon)** · copy of the plans repo (`selluxhenner/plans`, private) at commit `139bbd3`, folder
> `projects/nextup/`. The plans repo is the source of truth; this copy is refreshed when the page specs change.
> If something here looks out of date, ask Kevin.

The page specs point to these plans for decisions, function names, fields and limits. Sam has no access to the plans
repo, so the plans the specs use are copied here unchanged, except that the test secrets in the acceptance commands
are replaced by `<test value, see the plans repo>` (this repo is public and its secret scan refuses them).

| File | What it is |
|---|---|
| [PILOT.md](PILOT.md) | The Hauptplan (master plan): goal, the 24 phases in order, the decisions HD1-HD15 that hold for every phase, and one brief per phase (result, scope, done when, acceptance test, code area). |
| [ADM/](ADM/PLAN.md) | Administration in the app: settings frame, Company, Rules, Calendar, Org, Routing, Members, Connectors, Notifications, setup wizard, second factor. Most of specs 01, 02, 03, 06 and 08. |
| [AIP/](AIP/PLAN.md) | AI provider per company and the DPA gate (the AI block in spec 03). |
| [CLK/](CLK/PLAN.md) | Working-day clock and the company calendar (Calendar in 01, dates on the case page in 04). |
| [CNX/](CNX/PLAN.md) | Microsoft 365 and Jira behind the connector interfaces (03). |
| [DIR/](DIR/PLAN.md) | Directory sync from Entra, deactivate and delete in Members (01, 03). |
| [IDN/](IDN/PLAN.md) | Identity by user id and seats (Org and Members in 01, inbox in 04). |
| [NTF/](NTF/PLAN.md) | Outbox, reminders, digest, per-user opt-in (06, Profile in 04). |
| [VIS/](VIS/PLAN.md) | What each person may see, the projections behind inbox and dashboard, shared rate limits (04, 07). |

Phases without a build plan yet (GDP, LOOP, MET, TMS, FLR, API, EID, SFX, SEC, TST, PIL) have only their brief in
`PILOT.md`.

Refreshed from `feb971f` to `139bbd3` (2 Nov 2026, 14:49): the PLAN.md of ADM, AIP, CLK, DIR,
IDN, NTF and VIS and most of their tasks changed (status, lanes, PR numbers, decisions from the page specs); CNX and
`PILOT.md` are unchanged. No new Bauplan was written since, so GDP, LOOP, MET, SEC and the rest still have only their
brief. State at `139bbd3`: IDN and CNX merged; CLK A1, B1, C1, G1 merged, D1 built; AIP G1, A1, B1, E1 merged, C1
running; ADM G1 merged, A1 built, B1 running; DIR G1 running; NTF and VIS not started. The defensible-offer pages
(spec 11) use the plan [../../2026-11-02_defensible-offer-codex.md](../../2026-11-02_defensible-offer-codex.md),
which lives in this repo, not in the plans repo.

## How to read a build plan

- **Front matter** (between the `---` lines): `phases` are the waves of work, `decisions` are `D1`, `D2` … (a spec
  writes them as `ADM/D7` = decision 7 of plan ADM), `questions` are `Q1` … with a default answer.
- **Body:** goal, scope, done when, the work packages table (which task owns which files).
- **`tasks/<ID>-<n>.md`:** one task each, for example `ADM-A1`. `needs` = tasks that must be merged first; `owns` =
  the files that task changes; `proofs` = the tests that show it works; the text says what to build.
- `orch`, lanes, `budget`, `talk`, `autonomy`: settings for the automated agent sessions that build tasks on Kevin's
  PC. You can skip them.
