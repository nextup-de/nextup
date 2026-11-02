---
id: IDN-C1
title: New members get a handle, and a Microsoft just-in-time user gets the top
  role of their department
wp: C
needs: [ IDN-G1 ]
host: any
owns:
  - apps/app/src/features/auth/entra.ts
  - apps/app/src/lib/db/accounts.ts
  - apps/app/src/server/microsoft-login.ts
  - apps/app/src/server/actions/members.ts
  - docs/customer/ENTRA_SETUP.md
  - apps/app/tests/unit/entra.test.ts
  - apps/app/tests/unit/members.test.ts
  - apps/app/tests/unit/idn/jit.test.ts
  - apps/app/tests/db/idn-accounts.test.ts
risk: high
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D3, D4, D11, D12, D15 ]
proofs:
  - id: B1
    says: the ID token's department claim is read, and jitSeatRole gives the top
      role of the matching unit for a leader or manager and nothing for a
      member, an empty or unknown department or a unit without roles
    run: npm test -w @nextup/app -- tests/unit/idn/jit.test.ts -t 'IDN JIT seat
      plan'
  - id: B2
    says: createMicrosoftUser gives a member a handle and no seat, makes a leader of
      Engineering a holder of the Engineering lead role, creates no seat for an
      unknown department, and a second sign-in adds no second seat
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/idn-accounts.test.ts -t 'IDN JIT account'
status: merged
lane: pc/a
branch: orch/idn-c1
pr: 301
merge: "ec80423"
---

Plan IDN (sub-plan of PILOT): accounts. Today a user created by "Continue with Microsoft" or by a manager's Add
member has no handle (gap G-046) and holds no seat, so no route's case ever reaches them. After this task every new
member has a handle (D11) and a Microsoft user with a NextUp.Leader or NextUp.Manager role holds the top role of
their department (D12, Kevin 2026-11-02). Read first: `docs/IDENTITY.md`, `docs/customer/ENTRA_SETUP.md`,
`apps/app/src/features/auth/identity.ts`, `handle.ts`, `entra.ts` (`checkIdToken`, `landingFor`),
`apps/app/src/server/microsoft-login.ts` (the sign-in finish), `apps/app/src/server/actions/members.ts`,
`apps/app/src/lib/db/knowledge.ts`, and the tests named in `owns`.

## What

- `apps/app/src/features/auth/entra.ts`: `MicrosoftIdentity.department` read in `checkIdToken` from the
  `department` claim (D12); `jitSeatRole(k: { units: { id: string; key: string; name: string; sort: number }[];
  roles: { id: string; orgUnitId: string; reportsToId: string | null; sort: number }[] }, department: string, role:
  Role): string | null` exactly as D12, pure.
- `apps/app/src/lib/db/accounts.ts` (new): `createMicrosoftUser(companyId, who: MicrosoftIdentity, role: Role)`
  creates the user as `server/microsoft-login.ts` does today (display name rule, email, role, `ini`, `entraOid`)
  plus a handle when `needsHandle(role)` (`newHandle` over the company's existing handles), then calls
  `linkJitSeat`; `linkJitSeat(companyId, user: { id; name; email; role }, department)` exactly as D12. Both return
  what they did (`{ user, seat: "created" | "kept" | "none" }`) for the log line.
- `apps/app/src/server/microsoft-login.ts`: the create branch calls `createMicrosoftUser`; the found branch calls
  `linkJitSeat` after the role update; the log lines name the seat outcome (no personal data beyond what they log
  today).
- `apps/app/src/server/actions/members.ts`: `addMemberAction` gives a member a handle; the role change to member
  gives one when the user has none (D11).
- `docs/customer/ENTRA_SETUP.md`: a section "Department claim and role seats": how the customer's IT emits
  `department` in the ID token (a claims mapping policy on `user.department`), how NextUp maps it to a unit (name
  or key) and which role a leader or manager gets, and that without it the account has no seat until DIR or an
  admin seats it (Q2).
- `tests/unit/entra.test.ts`: the department claim is parsed (present, missing, not a string).
  `tests/unit/members.test.ts`: whatever the handle needs.
- Tests:
  - `apps/app/tests/unit/idn/jit.test.ts`, `describe("IDN JIT seat plan", …)`: on knowledge built with
    `rowsFromSeed(SEED, DEMO_GOALS, counter)`: leader + "engineering" gives the role of the holder labelled
    `M. Roth`; manager + "ENG" (the key) the same; leader + "Production" gives the role whose holder is `B. Hartmann`
    (it reports to a role of another unit); member + "Engineering" gives null; "" and "Marketing" give null; a unit
    without roles gives null.
  - `apps/app/tests/db/idn-accounts.test.ts`, `describe("IDN JIT account", …)` (D15): a company with the demo
    template's rows; `createMicrosoftUser` for a member gives a user with a handle matching `/^Anonymous #\d{4}$/`
    and no seat; for a leader with department "Engineering" a user holding exactly one seat whose role is the
    Engineering lead role, with `loadUsersOfRole` of that role now listing them; for a leader with department
    "Marketing" no seat; `linkJitSeat` again for the Engineering leader returns `"kept"` and adds no row; a leader
    whose name equals an existing holder of that role gets the label `<name> (<email>)`.

## Not

- No directory sync, no Graph calls (DIR). No admin screen (ADM).
- No change to `landingFor`'s rules (who gets an account at all) and no change to `/admin` sign-in.
- No `.prisma` file, no migration (D3). No comparison of display names (D2): a seat is found by the department and
  role rule, never by the person's name.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(idn-c1): …`. Leave nothing unsaved. orch pushes and opens the PR.
