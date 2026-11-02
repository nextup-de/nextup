---
id: TRUTH-B1
title: /people/[name] and its profile links are gone, and hiddenPeople no longer reaches the browser
phase: TRUTH
needs: [ P0 ]
owns:
  - apps/app/src/app/[company]/(app)/people/[name]/page.tsx        # deleted
  - apps/app/src/app/demo/(app)/people/[name]/page.tsx             # deleted
  - apps/app/src/app/[company]/(app)/layout.tsx
  - apps/app/src/components/dashboard/DemoProvider.tsx
  - apps/app/src/components/demo/StaticDemo.tsx
  - apps/app/src/components/dashboard/leader/IdeaParts.tsx
  - apps/app/src/components/dashboard/team/DashboardView.tsx
  - apps/app/src/components/ideas/RaisePerson.tsx
  - apps/app/src/components/profile/ProfileView.tsx
  - apps/app/src/features/search/navbar.ts
  - apps/app/tests/unit/search.test.ts
  - apps/app/tests/e2e/demo/i18n.spec.ts
  - apps/app/tests/unit/truth/no-person-pages.test.ts
  - docs/ROUTES.md
risk: normal
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, HD5, HD10 ]
proofs:
  - id: B1
    says: no person route exists, the search index has no person results with a link, and the tenant prop type has no hiddenPeople
    run: npm test -w @nextup/app -- tests/unit/truth/no-person-pages.test.ts -t 'TRUTH no person pages'
    expect: '[1-9]\d* passed'
pr_title: "fix(people): remove the name-keyed person pages and hiddenPeople"
---

# TRUTH-B1 /people/[name] and its profile links are gone, and hiddenPeople no longer reaches the browser

## Goal

Two contradictions go in one PR. The per-person page `/[company]/people/[name]` (and its copy in the static demo) is
keyed by display name (HD10 forbids that) and shows per-person counts (HD5). And the app layout sends
`hiddenPeople`, the real names of every member with an anonymous handle, to every browser, two lines under a comment
that promises the opposite. The list exists only to hide profile links; with the links gone, it goes too. MET later
builds a role-centric `/people/[userId]` (spec 04 "Person page"); that is not this task.

## Context (read first)

- `AGENTS.md`; `apps/app/src/app/[company]/(app)/layout.tsx` (the `DemoProvider` `tenant` prop, `hiddenPeople`).
- `apps/app/src/components/dashboard/DemoProvider.tsx` (tenant type: `hiddenPeople?: string[]`).
- Every link to `/people/`: `IdeaParts.tsx`, `team/DashboardView.tsx`, `RaisePerson.tsx`, `ProfileView.tsx`
  (its `target` mode and the "people nearby" list), `features/search/navbar.ts` (person results with
  `go: { view: "people" }`), `components/demo/StaticDemo.tsx`.
- Tests that know the route: `tests/unit/search.test.ts` ("links people directly to profiles"),
  `tests/e2e/demo/i18n.spec.ts` (one row for the person page). `tests/unit/proxy-matcher.test.ts` uses a people path
  only as a sample URL with a dot: leave it.
- `docs/ROUTES.md` lists `people/[name]` for `/demo/*`.
- Spec: [11-defensible-offer-pages.md, "Removed: contributor ranking and person pages"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#removed-contributor-ranking-and-person-pages).

## What

- Delete both `people/[name]/page.tsx` files. A request to `/acme/people/x` then gets the normal not-found page.
- Remove every `href` to `/people/…`: a person's name stays as plain text where it was a link; "View profile"
  buttons go. `ProfileView.tsx` keeps the viewer's own `/profile`; its `target` mode and the colleagues list
  ("people nearby") go if only the deleted page used them.
- `navbar.ts`: no result of kind "Person" (a person is not a destination any more); roles and units stay.
- Remove `hiddenPeople` from the tenant type, the layout, `StaticDemo.tsx` and every reader.
- Update `search.test.ts` (person results gone) and drop the person row from `i18n.spec.ts`.
- `docs/ROUTES.md`: remove `people/[name]` from the `/demo/*` row and any `/people` row.
- New test `apps/app/tests/unit/truth/no-person-pages.test.ts`, `describe("TRUTH no person pages", …)`:
  - with `fs.existsSync`, neither `src/app/[company]/(app)/people` nor `src/app/demo/(app)/people` exists;
  - `navbarIndex(ctx)` (build `ctx` as `search.test.ts` does) has no entry with `kind === "Person"` and no `href`
    containing `/people/`;
  - the source of `components/dashboard/DemoProvider.tsx` and of `app/[company]/(app)/layout.tsx` does not contain
    `hiddenPeople` (read the files as text).

## Not

- No `/people/[userId]` page (MET). No change to `/profile`, `proxy.ts` or `page-guard.ts` (their comments mention a
  people URL as an example; leave them). No metrics change (TRUTH-A1).

## Constraints

- Edit only the paths in `owns`. This task must merge before VIS-C1 starts (VIS-C1 owns the layout and
  DemoProvider too); if `layout.tsx` already reads a viewer-filtered log from `lib/db/viewer-log.ts`, stop with
  `status: "question"`.
- No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/truth/no-person-pages.test.ts -t 'TRUTH no person pages'` (≥ 1 passed)
- `npm test -w @nextup/app -- tests/unit/search.test.ts`

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test and build green; only owned paths changed.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
