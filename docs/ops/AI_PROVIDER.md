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
   `routing.json`, which stays as it is), open a PR and put the compare table in the description.
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

## Model on this stack

The fifth company choice (`local`, Q8.4, decision 2026-11-10): the model runs on the company's own stack and nothing
leaves it. No endpoint, no key, no data-processing agreement date, so it is the choice to offer on a customer's own
VM next to their own provider (Q8.8), and it is not a sub-processor (`docs/compliance/SUBPROCESSORS.md`).

**What the stack needs.** The brain with its own model: `stack/install.sh --brain` (Ollama with `mistral-nemo`,
about 8 GB more memory, pulled once on first start, then offline). `--brain-cloud` is not enough: it has no model
server of its own, so the choice shows a problem. A stack may point `BRAIN_LLM_URL` at a model server of its own
elsewhere (a GPU box on the private network); then that server's operator is named per customer.

**Where each call goes.** Everything to `BRAIN_URL` with `BRAIN_API_KEY`, inside the stack:

| Call | Path |
|---|---|
| routing, reading, coach, plan, check-in | `/v1/route`, `/v1/read`, `/v1/coach`, `/v1/plan`, `/v1/checkin` with no `llm` in the body (`llmFor` gives `"none"`), so the brain uses its stack model |
| the raise-page assistant (streamed, with its lookups as tools) and the idea studio's fallback | `/v1/chat/completions`, OpenAI chat format (`apps/app/src/server/ai/openai.ts`, kind `local`) |
| the company context draft | `/v1/chat/completions`, not streamed |

The brain's `/v1/chat/completions` (`services/brain/brain/chat.py`) passes the call to its own model server only; the
model a request names is ignored and the answer names the stack's model. The app sends `stack` as the name.

**Setting it.** `/admin/connectors` → AI provider → "Model on this stack" → Save. The card then reads "Model on
this stack · nothing leaves the server". The app asks the brain's `/health` (status `ok` only with the model loaded)
on the Connectors page, the setup overview and Settings → Go-live; the go-live AI check is done only while it says
`ok`, "needs" without a brain service and "unknown" while it does not answer. The model calls themselves check only
that `BRAIN_URL` and `BRAIN_API_KEY` are set (`aiGate`, `stackBrain`); a brain that fails answers as today: the
keyword proposal, the offline coach, the assistant's "could not answer".

**Budget.** The monthly budget applies as to every model (`docs/ASSISTANT.md`, "The monthly budget"). The calls are
recorded under the name the model reports (`mistral-nemo`). A model on our own hardware costs no tokens, so enter it
with price 0 on "Prices per model" (`mistral-nemo 0 0`); without a price it is held to the monthly token limit.

**Release.** The brain's chat path ships in the brain image; a stack on the choice needs app and brain of the same
release (`install.sh` moves both together when the instance runs a brain).

## When neither qualifies

Keep the AI off for the pilot (PILOT/HD8): `LLM_PROVIDER=mock`, as in `AI_DEMO.md`. Everything
routes by the keyword router. Do not lower 0.80 or raise 8000 ms to fit a result. Try another
model or deployment, record again, and compare again.
