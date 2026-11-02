---
id: AIP-E1
title: An 84-case routing eval, a third German, runs in CI with a threshold
wp: E
needs: [ AIP-G1, IDN-Z1 ]
host: any
owns:
  - services/brain/eval/**
  - .github/workflows/ci.yml
risk: high
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D11, D12, D13 ]
proofs:
  - id: B1
    says: the eval set has at least 84 cases, a third German, every acme route at
      least six times and only known route ids, and the recorded answers score
      at or above their threshold while a broken record fails
    run: tar -C services/brain -c . | docker run --rm -i
      ghcr.io/astral-sh/uv:python3.12-bookworm-slim sh -c "mkdir -p /w && cd /w
      && tar -x && uv sync --frozen && uv run --frozen pytest
      eval/test_eval_set.py"
    expect: '[1-9]\d* passed'
status: merged
lane: pc/c
branch: orch/aip-e1
pr: 321
merge: "6ee7aef"
---

Plan AIP (sub-plan of PILOT): routing quality. Read first: D11 and Q2, Q3 of the plan, `services/brain/README.md`,
`services/brain/eval/run_eval.py`, `eval/acme.json`, `eval/test_ideas.json`, `.github/workflows/ci.yml` (job
`brain-tests`, Kevin's file: `risk: high`).

## What

- `services/brain/eval/routing_cases.json` (new): 84 or more cases as D11, written for acme's routes (eval/acme.json),
  at least 28 in German (natural shop-floor and office German, not translations of the English ones), at least six
  per route, a few that should land on no route (`route_id: null`). No real names (Q3: Victor reviews the German
  ones later).
- `services/brain/eval/run_eval.py`: reads `routing_cases.json` too; `--recorded <file>` scores recorded answers
  without a model; `--threshold` (default 0.80) and a non-zero exit below it; prints accuracy overall, per language
  and for the keyword baseline.
- `services/brain/eval/recorded/routing.json` (new): one answer per case, `{ "model", "prompt_version",
  "threshold", "answers": { <case id>: <route id or null> } }`. The lane has no model, so it writes the file with
  `run_eval.py --record-keywords` (the keyword router's answers, `"model": "keywords-v1"`) and sets `threshold` to
  the keyword accuracy it measures, rounded down to two decimals. Kevin's first live run replaces the file and sets
  the brain threshold (Q2).
- `services/brain/eval/test_eval_set.py` (new pytest): the set rules of D11 hold; `--recorded` on the shipped file
  exits 0; on a copy with ten answers flipped it exits non-zero.
- `.github/workflows/ci.yml`: job `brain-eval` next to `brain-tests`, same uv image, running `uv run --frozen pytest
  eval/test_eval_set.py` and `uv run --frozen python -m eval.run_eval --recorded eval/recorded/routing.json`.

## Not

- No live model call in CI or in the lane. No change to `services/brain/brain/` or `services/brain/tests/`
  (AIP-B1), no `pyproject.toml` or `uv.lock` change. None of the paths of D13.

## Done when

The proof is green and lint, typecheck, test, build stay green; the CI run of the PR shows `brain-eval` green.

Commit everything; an unfinished state as `wip(aip-e1): …`. Leave nothing unsaved. orch pushes and opens the PR.
