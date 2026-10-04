# Plan: AI server — test first, then rent the GPU

> **Plan · 2026-10-03 · open.** Follows the AI part of `2026-09-27_platform.md` and the AI server
> from PR #149 (`stack/brain-server/`). Nothing here is bought or built yet.

## Where we are

- The brain (routing + coach) runs on `nextup-brain`, a Hetzner Cloud CPX42 (8 vCPU, 16 GB, no
  GPU, about €74/month), with `mistral-nemo` from Ollama. That model is the stock model with our
  prompts. **We did not train or fine-tune it**, so never call it "our trained model" in a pitch.
- Measured 30 Sep 2026 with one user: first call ~35 s (model load), then routing ~6 s, coach
  ~11 s. That is inside the app's timeout. One request uses all 8 cores, though, so ten pilot users
  at once would queue. **The CPU server works for a demo, but it cannot serve a pilot.**
- The candidate is the Hetzner **GEX45**: RTX PRO 4000 Blackwell 24 GB VRAM, i5-13500, 64 GB RAM,
  2×512 GB NVMe, €214/month + €209 one-time setup, monthly cancellation.
- `services/brain/eval/run_eval.py` already scores routing against 32 labelled Acme ideas and
  compares it with the keyword router. The brain talks to any OpenAI-compatible endpoint
  (`brain/llm.py`), so changing the model or the server is a config change, not code.

## The rule

Measure before paying. The €423 for the first GEX45 month is only spent once a test shows that
(a) a model that fits in 24 GB routes clearly better than what we have, and (b) the CPU server
cannot handle pilot load.

## Steps

### 1. Make the test set worth trusting (1–2 days)

- [ ] Extend `eval/test_ideas.json` from 32 to **at least 80 ideas**:
  - Automotive plant language: shifts, lines, quality, MES, purchasing limits, works council.
  - **At least a third in German**, because BMW and VW employees will write German. Mixed
    German/English too.
  - At least 10 ambiguous ideas that could fit two routes (put the second one in `alt`).
  - At least 10 duplicates of earlier items (`dedup`, `match`).
- [ ] Someone who did not write the routing prompt labels the right route (Sam or Victor).
  Otherwise we are testing the prompt against its own author.
- [ ] Add a `lang` field and report accuracy per language in `run_eval.py`.

**Done when:** the set has ≥80 labelled ideas and the eval prints accuracy for all ideas, for
German only and for duplicates.

### 2. Baseline on what we run today (½ day)

- [ ] Run `run_eval` on `nextup-brain` with `mistral-nemo` (the README's throwaway-container
  method, so the live brain is not touched).
- [ ] Write down route accuracy, duplicate accuracy, p50 and p95 latency, and the keyword
  router's score.

**Done when:** one results file in `eval/results/` and one row in the table below.

### 3. Candidates on an hourly GPU (1 day, ≤ €30)

- [ ] Rent a 24 GB GPU by the hour (an L4 or RTX 4090 class card, an EU provider, demo data
  only). Run Ollama there with the **same quantisation we would use on the GEX45**.
- [ ] Run the eval for each model:

  | Model | Why | Fits 24 GB? |
  |---|---|---|
  | `mistral-nemo` (12B) | the baseline, now on a GPU | yes |
  | `gpt-oss-20b` | strong reasoning, Apache 2.0 | yes (~14 GB) |
  | Qwen3.6, largest size that fits | strong multilingual, Apache 2.0 | check the size |
  | Gemma 4, largest size that fits | good German | check the size; **check the licence** |
  | one small model (4–8B) | could it run on the CPU server? | yes |

- [ ] Also run the coach evals (`run_coach`, `run_dialogs`) for the top two. Routing is not the
  only job.

**Done when:** the results table below is filled in for every model.

### 4. Load test (½ day)

- [ ] A small script that sends 10 routing calls at once, 5 rounds in a row.
- [ ] Run it against the CPU server (small model, if it qualified) and against the GPU.

**Done when:** p95 latency at 10 users at once is known for both. The target is p95 under
`BRAIN_TIMEOUT_MS`, with headroom.

### 5. Decide (Kevin)

| If | Then |
|---|---|
| The small model is within ~3 points of the best and the CPU server keeps p95 at 10 users | Stay on the CPU server, switch the model, no GPU yet |
| A 20B-class model is clearly better, or the CPU server fails the load test | Order the GEX45 (step 6) |
| No model beats the keyword router by a clear margin | Don't spend money; fix the prompt and the routing table first |

### 6. Move to the GEX45 (1–2 days, only if step 5 says so)

- [ ] Order the GEX45 (Kevin). Choose a location where the private network can reach it.
- [ ] **Private network:** a dedicated server cannot join a Cloud network on its own. It needs a
  Hetzner **vSwitch** coupled to the `nextup` Cloud network (10.77.0.0/16), so the box keeps
  calling the brain privately. Otherwise use a firewall that allows only the box's IP. Either
  way, the brain is never open to the internet.
- [ ] Install the NVIDIA driver and container toolkit; give the `ollama` service in
  `stack/brain-server/compose.yml` the GPU (a `gpu` profile or override file, so the CPU setup
  still works).
- [ ] `brain-server.sh install` + `test` on the new server with the chosen `BRAIN_MODEL`.
- [ ] Run the eval and the load test once on the real server, and compare with step 3.
- [ ] `stack/nginx/set-brain.sh acme <new private URL>`. Run both servers in parallel for one
  week.
- [ ] Cancel the CPX42. The real increase is then about €140/month, not €214.

**Done when:** acme routes and coaches through the GEX45, eval and load numbers match step 3,
and the CPX42 is cancelled.

### 7. Before a BMW/VW pilot touches it (not hardware, but it decides the pilot)

- [ ] Ask the pilot contact early: may their data be processed on a Hetzner server we run? Do
  they require TISAX (and which level) for a pilot, or only for production?
- [ ] One GPU server per customer, or shared? A shared model server sees every company's ideas.
  Our platform rule is one stack per company (`2026-09-27_platform.md`), so for real data the
  default is **one AI server per pilot customer**, or the customer's own.
- [ ] The brain keeps no prompt logs: check Ollama and brain logging on the server.
- [ ] Company stage `pilot` with the DPA date set (`docs/SECURITY.md`, `policyFor()`).
- [ ] Licence of the chosen model checked for commercial and on-prem use.

### 8. For on-prem customers later

- [ ] A one-page sizing sheet: "NextUp AI needs one GPU with ≥ 24 GB VRAM (or an
  OpenAI-compatible endpoint you already run) + model X". Big OEMs then bring their own GPU, and
  we never buy hardware for them.
- [ ] `BRAIN_LLM_URL` pointing at the customer's own endpoint (vLLM, Azure OpenAI or Bedrock in
  their account) is tested once.

## Results (fill in)

| Date | Model | Where | Route acc. (all / DE) | Dedup acc. | p50 / p95 (1 user) | p95 (10 users) |
|---|---|---|---|---|---|---|
| | keyword router | — | | — | — | — |
| | mistral-nemo | CPX42 CPU | | | ~6 s / ? | |

## Costs

| Item | Cost |
|---|---|
| Steps 1–4 (hourly GPU) | ≤ €30 once |
| GEX45 | €214/month + €209 setup |
| CPX42 cancelled after the switch | −€74/month |
| Net with GEX45 | about +€140/month, first month about €350 |

## Not doing

- Buying GPU hardware. Load is unknown, and prices are high. Renting monthly keeps the option to
  stop.
- Fine-tuning a model. Only worth it after the eval shows prompts alone fall short.
