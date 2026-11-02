---
id: PACK-A1
title: The works-council pack is generated from the running configuration
phase: PACK
needs: [ TRUTH-F1, BVW-E1 ]
owns:
  - apps/app/src/features/pack/works-council.ts                   # new, pure
  - apps/app/src/lib/db/pack.ts                                   # new: gathers the config
  - apps/app/src/app/[company]/(app)/settings/works-council/pack/route.ts   # new: GET download
  - apps/app/src/i18n/messages/pack.ts                            # new namespace
  - apps/app/tests/unit/pack/works-council.test.ts
  - apps/app/tests/db/pack-config.test.ts
risk: normal
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO2, DO3, HD5, HD7, HD8, HD9, HD14 ]
proofs:
  - id: B1
    says: worksCouncilPack renders, in German and English, the data kept and for how long, each role and what it sees, the AI provider and its switches, the score parts and points, the premium rule, the KPI minimum group, the no-ranking rule and the audited actions, all from the config it is given, and changes when the config changes
    run: npm test -w @nextup/app -- tests/unit/pack/works-council.test.ts -t 'PACK works-council pack'
    expect: '[1-9]\d* passed'
  - id: B2
    says: loadPackConfig reads one company's retention, AI settings, rules, premium rule and roles, and the download route serves the pack to a company admin only
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/pack-config.test.ts -t 'PACK config'
    expect: '[1-9]\d* passed'
pr_title: "feat(pack): works-council pack from the running config"
---

# PACK-A1 The works-council pack is generated from the running configuration

## Goal

Works councils co-determine the BVW and any software able to monitor performance (BetrVG § 87(1) Nr. 6 and Nr. 12).
A pack written by hand drifts from the code. After this task a company admin downloads a pack generated from the
stack's actual settings: what is stored and for how long, who sees what, whether and which AI runs, how the score and
the premium are computed, and that no person is ranked. The lawyer-checked annex (PACK-L) references this output.

## Context (read first)

- `AGENTS.md`; `apps/app/src/config/` (roles, `ROLE_ACCESS`), `features/ai/settings.ts`, `features/ideas/benchmarks.ts`
  and `features/scoring/index.ts` (parts and points: read the constants, never copy numbers into text),
  `features/premium/formula.ts` (BVW-D1), `CompanyConfig.retentionDays`, GDP retention rows if merged,
  `features/audit/index.ts` (TRUTH-F1 actions).
- Spec: [11, "Works-council pack"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#works-council-pack).

## What

- `features/pack/works-council.ts`: `worksCouncilPack(config: PackConfig, locale): { title: string; sections: {
  key: string; heading: string; lines: string[] }[]; generatedAt: string; configHash: string }` and
  `toMarkdown(pack)`. Sections: purpose and scope, data stored (fixed list of tables in plain words) and retention,
  roles and visibility, AI (provider, purposes on/off, DPA date, masking), score (each part with its points, "no model
  output changes a score"), premium rule, KPIs and the minimum group of 5, no person ranking (HD5), audit (actions
  recorded), personnel number (HD14), what is not done (no monitoring, no per-person metrics).
- `lib/db/pack.ts`: `loadPackConfig(companyId)`.
- Route `settings/works-council/pack/route.ts`: `GET` → `text/markdown` attachment
  `<slug>-works-council-pack-<date>.md`, company admins only (the settings guard), audit `audit.privacy.pack`.
- Catalog `pack.ts` in both languages (HD9).
- Tests: `tests/unit/pack/works-council.test.ts`, `tests/db/pack-config.test.ts`.

## Not

- No legal text beyond plain description (PACK-L), no PDF (the page's print view, Sam), no AI-Act sheet (PACK-B1).

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/pack/works-council.test.ts -t 'PACK works-council pack'` (≥ 1 passed)

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
