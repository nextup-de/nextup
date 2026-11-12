# Choosing the AI provider for the pilot

Plan AIB (D3). The brain runs on Amazon Bedrock (`eu-central-1`) or Azure OpenAI (EU). Kevin
records the routing eval once per provider; `compare` applies the rule and names one.

**The rule.** A provider qualifies when its recorded accuracy over the routing cases
(`services/brain/eval/routing_cases.json`, at least 84) is **at least 0.80** and its **p95 latency
per route call is at most 8000 ms** (the raise timeout, `DEFAULT_RAISE_TIMEOUT_MS`). Among those
the lower `cost_usd` of the recorded run wins; on equal cost the lower p95.

This extends `docs/demo/AI_DEMO.md` (section 1: AWS account, Bedrock access, IAM user, keys in
`.env`, budget alarm). It does not repeat it.

## Steps (Kevin)

1. **Bedrock.** In `eu-central-1`, check the model on the Bedrock console's Model access page; the
   criteria differ per model. Give an IAM user the policy of `AI_DEMO.md` section 1 step 3, with the
   model you test. Export `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` in your shell.
2. **Azure OpenAI.** Create an Azure OpenAI resource in an EU region and a model deployment in it
   (Q3). Note the deployment name (this is `--model`), the endpoint
   `https://<resource>.openai.azure.com/openai/v1` and a key. `export AZURE_OPENAI_KEY=...`: the key
   is read only from this variable, never from an argument or a file.
3. **Prices.** Open the current Bedrock price page (region `eu-central-1`) and the Azure OpenAI
   price page (your region and deployment type). Write down USD per million input and output
   tokens for each. Prices differ by region, so they are passed per run and stored in the record. Enter the
   customer's price in euros on `/admin/connectors` → AI provider → "Prices per model" as well, under the name the
   model reports, so the monthly budget counts it (docs/ASSISTANT.md, "The monthly budget").
4. **Smoke.** One coach, one plan and one checkin call each; exit 1 if any fails. Run from
   `services/brain`:

   ```bash
   uv run python -m eval.smoke --provider bedrock --model <bedrock model id>
   uv run python -m eval.smoke --provider azure-openai --model <deployment> --endpoint <endpoint>
   ```
5. **Record both runs.**

   ```bash
   uv run python -m eval.run_eval --provider bedrock --model <bedrock model id> \
       --record eval/recorded/bedrock.json --price-in <usd/MTok> --price-out <usd/MTok>
   uv run python -m eval.run_eval --provider azure-openai --model <deployment> --endpoint <endpoint> \
       --record eval/recorded/azure-openai.json --price-in <usd/MTok> --price-out <usd/MTok>
   ```

   Each run calls the model once per case through the same path as a request. The file holds
   provider, the answering model, prompt version, threshold, answers, errors, token counts, p50
   and p95 latency, the prices, `cost_usd` and the time. It holds no key, endpoint, region or
   account id. A failed call counts as an error and a miss. `run_eval --recorded <file>` scores
   it later without a model.
6. **Compare.**

   ```bash
   uv run python -m eval.compare eval/recorded/bedrock.json eval/recorded/azure-openai.json
   ```

   It prints a table and the winner. It exits 1 when no provider qualifies.
7. **Get the records to `main`.** Nothing records itself and no run is committed by an agent.
   Branch `chore/ai-provider-records`, commit the two files in `eval/recorded/` (not
   `routing.json`, which stays as it is, nor `chosen.json`, which follows the result), open a PR and put the compare
   table in the description.
   Merging it answers Q2: the recordings are the evidence for the choice. Review them for a key or
   endpoint before you push.

## What a run costs

One run is one model call per case (plus a retry when the output is invalid): roughly 90 calls of
a few thousand input tokens and a few hundred output tokens, so about 0.3 million input and 0.03
million output tokens. At typical Sonnet-class list prices that is **well under 5 USD per
provider**; both runs together stay in the same range. The exact figure is `cost_usd` in each
record. The smoke check costs a few cents.

## Data-processing agreements

The data-processing agreements with AWS and Microsoft are Kevin's (PILOT/HQ11). The eval sends
only the synthetic Acme cases, but a customer's ideas go to the chosen provider in the pilot, so
sign the agreement of the winner before any customer text leaves the box.

The same goes for where a request runs. Anthropic's Bedrock page lists `eu-central-1` with Global and
EU routing, not in-region only, and global routing can leave the EU. Neither it nor AWS's pages say
which of the two a plain `anthropic.<model>` id on `bedrock-mantle.eu-central-1.api.aws` gets. Confirm
that with AWS (and how to ask for EU routing) before customer text goes there.

## When neither qualifies

Keep the AI off for the pilot (PILOT/HD8): `LLM_PROVIDER=mock`, as in `AI_DEMO.md`. Everything
routes by the keyword router. Do not lower 0.80 or raise 8000 ms to fit a result. Try another
model or deployment, record again, and compare again.

## Result

**Chosen 12 Nov 2026: Azure OpenAI, `gpt-4.1-mini-2025-04-14`, EU data zone.** Kevin chose Azure alone and did not
record Bedrock (AIB D14), so `compare` ran on `eval/recorded/azure-openai.json` (recorded 5 Nov 2026) by itself.

| Provider | Model | Accuracy | German | English | p50 | p95 | Errors | Cost of the run | Month at 2,000 raises |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Azure OpenAI | gpt-4.1-mini-2025-04-14 | 0.946 (87/92) | 0.941 (32/34) | 0.948 (55/58) | 1,919 ms | 2,590 ms | 0 | 0.079 USD | ≈ 1.72 USD |
| Bedrock | — | not recorded | | | | | | | |

It qualifies with room on both rules: 0.946 against 0.80, and 2,590 ms against 8,000 ms. The keyword router
(`keywords-v2`) scores 0.783 on the same cases. Prices of the run: 0.484 USD in, 1.936 USD out per million tokens.
The month figure is the routing call alone (0.079 USD / 92 cases × 2,000); the assistant, coach and read calls of a
raise come on top, and the monthly budget (`docs/ASSISTANT.md`) counts all of them.

**What guards it.** `eval/recorded/chosen.json` holds the chosen run's model, prompt version and answers with a
threshold of 0.94 (its accuracy rounded down, never below 0.80). `tests/test_provider_choice.py` (CI `brain-tests`)
recomputes the winner from the recordings in `eval/recorded/` and fails when it differs from `chosen.json` or scores
below that threshold. `routing.json` stays the keyword router's answers, which `brain-eval` and the app's
`tests/unit/routing.test.ts` hold to the app's matcher. A `bedrock.json` merged later takes part in the choice by
itself: the test then names the cheaper qualifying provider, and `chosen.json` is updated in the same PR.

**Price.** `features/ai/usage.ts` lists `gpt-4.1-mini` at the run's prices, so a company that has not entered its own
price is counted at these in its monthly budget instead of against the token limit. The company's own price (on
`/admin/connectors`) still wins.

**Before customer text goes to Azure:** the data-processing agreement with Microsoft and an EU data zone deployment
(PILOT/HQ11, above).
