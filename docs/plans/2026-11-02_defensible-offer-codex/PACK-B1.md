---
id: PACK-B1
title: Each decision exports its explanation; the AI-Act information sheet is filled from the AI settings
phase: PACK
needs: [ PACK-A1, TRUTH-D1, TRUTH-E1 ]
owns:
  - apps/app/src/features/pack/explain.ts                         # new, pure
  - apps/app/src/features/pack/ai-act.ts                          # new, pure
  - apps/app/src/app/[company]/(app)/cases/[caseId]/explanation/route.ts   # new: GET
  - apps/app/src/app/[company]/(app)/settings/works-council/ai-act/route.ts # new: GET
  - apps/app/src/i18n/messages/pack.ts
  - apps/app/tests/unit/pack/explain.test.ts
risk: normal
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, DO2, HD5, HD7, HD8, HD10 ]
proofs:
  - id: B1
    says: explainDecision lists route and its source, score parts, facts from suggestions, every AI involvement (proposal, coach, translation), the review and committee steps, who decided as role then seat, and the dates; aiActSheet names provider, region, purposes and that no AI output decides
    run: npm test -w @nextup/app -- tests/unit/pack/explain.test.ts -t 'PACK decision explanation'
    expect: '[1-9]\d* passed'
pr_title: "feat(pack): per-decision explanation and AI-Act sheet"
---

# PACK-B1 Each decision exports its explanation; the AI-Act information sheet is filled from the AI settings

## Goal

A works council or an affected employee may ask why a case was routed, scored and decided the way it was, and the
AI Act asks deployers to inform worker representatives (Art. 26(7)) and to be transparent about AI use. After this
task every case exports its explanation, and the company's AI-Act information sheet is generated from its AI settings.

## Context (read first)

- `AGENTS.md`; TRUTH-D1 `routeSourceOf`, TRUTH-E1 `factProvenance`, BVW-A1/C1 review and committee, BVW-H1
  translations, `features/ai/settings.ts` and the gate; PACK-A1's pack and catalog.
- Who may download a case's explanation: anyone who may open the case (VIS rule), plus the works-council role
  (PACK-C1) for decided cases only, without the raiser's name when the raiser has a handle.

## What

- `features/pack/explain.ts`: `explainDecision(log, caseId, ctx)` → facts (no sentences), and `toMarkdown(…, locale)`.
- `features/pack/ai-act.ts`: `aiActSheet(settings, locale)` → sections: system purpose, provider and region, purposes
  on (routing proposal, coach, assistant, translation), what AI never does (score, decide, premium, KPIs), human
  oversight, contact.
- Two GET routes returning `text/markdown` attachments, guarded as above; audit `audit.privacy.explanation`.
- Test `tests/unit/pack/explain.test.ts`, `describe("PACK decision explanation", …)`.

## Not

- No page (Sam), no legal review (PACK-L).

## Constraints

- Edit only the paths in `owns` (the catalog file is shared with PACK-A1: merge after it). No `git commit`, no
  installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/pack/explain.test.ts -t 'PACK decision explanation'` (≥ 1 passed)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
