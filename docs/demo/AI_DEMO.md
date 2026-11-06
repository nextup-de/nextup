# AI demo runbook

How to run the AI part of a customer demo, and what it costs. Plan AID. The demo works with the
AI off: every offline-safe question below is routed by the keyword router (`features/routing`
`propose`, `keywords-v2`) on acme's routes.

## 1. Before the first demo (Kevin, once)

1. An AWS account.
2. Bedrock model access for Claude Sonnet 5.5 in `eu-central-1`.
3. An IAM user whose policy allows only inference on that model. The app and the brain call the
   Mantle endpoint (`bedrock-mantle.<region>.api.aws`), which checks `bedrock-mantle:CreateInference`,
   not `bedrock:InvokeModel`. That action has no per-model ARN, so a condition narrows it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": "bedrock-mantle:CreateInference",
       "Resource": "*",
       "Condition": { "StringEquals": { "bedrock-mantle:Model": "<Bedrock model id>" } }
     }]
   }
   ```

   AWS shows this condition only with an OpenAI model id, so it is untested with `anthropic.<model>`.
   If the first call answers AccessDenied, read which action or condition it names before widening.
4. Its keys as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `instances/<slug>/.env` on the box
   and in the sops copy in nextup-infra. Never in this repo.
5. In the same `.env`: `LLM_PROVIDER=bedrock`, `LLM_MODEL=<Bedrock model id>`,
   `LLM_REGION=eu-central-1`.
6. An AWS budget alarm, e.g. 50 USD per month.
7. Check the AWS price page for `eu-central-1` against the list prices used for the cost figures.

## 2. Demo members

The role holders of the demo company's routes get the team's mail addresses through
settings → members, so a routed case reaches a real inbox and someone answers live.

## 3. The script

Source: `apps/app/src/config/demo-ai-script.ts` (`DEMO_AI_SCRIPT`). Each question is a case of
`services/brain/eval/routing_cases.json`.

| id | lang | question | expected route | offline-safe |
|---|---|---|---|---|
| q001 | en | Our hand scanner broke and a new one costs about 250 euros, but the order needs three approvals. | r1 | yes |
| q012 | en | The endurance rig is booked solid by series validation; we need two days to test the new belt tensioner. | r2 | yes |
| q023 | en | Measurements on station 7 drift away from the reference gauge and we scrap good parts. | r3 | yes |
| q041 | de | Der neue Kollege hat nach drei Wochen immer noch keinen Zugang zum Fertigungssystem. | r4 | yes |
| q030 | de | Die Messwerte an Station 7 weichen vom Referenzmessgerät ab, wir sortieren gute Teile aus. | r3 | yes |
| q008 | de | Für ein Ersatzteil für 120 Euro brauche ich drei Unterschriften, das dauert länger als die Reparatur. | r1 | no |

Order: the offline-safe English questions first (q001, q012, q023), then the German ones. q008 is
not offline-safe; skip it when the AI is off.

## 4. Ten minutes before

1. Ask one question once. This warms the prompt cache.
2. Check that the first word appears within about 2 s.
3. If Bedrock fails, set `LLM_PROVIDER=mock` and redeploy. The offline-safe questions still route by
   keywords.

## 5. Live eval (Kevin, by hand)

1. In `services/brain`, run `uv run python -m eval.run_eval` against the brain's model (the brain's
   `LLM_*`).
2. Commit the refreshed `eval/recorded/routing.json`.
3. Raise the CI threshold to the measured accuracy minus a margin.

Claude for the brain follows in phase AIB.

## 6. Cost

Token counts are stored per turn in `AssistTurn`. They include cache reads, so they are an upper
bound on what is billed. `aiUsage` (AID-B1) sums them per company and month.
