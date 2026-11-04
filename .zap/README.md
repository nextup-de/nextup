# ZAP baseline: ignore file

CI job `zap` (`.github/workflows/ci.yml`) scans the demo app with the OWASP ZAP baseline and runs
`node ops/zap-gate.mjs zap-report.json .zap/ignore.json`. The gate fails on every High alert
(riskcode 3) that is not ignored here. Medium and Low alerts are printed as warnings.

`ignore.json` is a JSON array, empty by default. An entry:

```json
{ "pluginId": "10038", "url": "http://localhost:3100/some/path", "reason": "why this is accepted", "until": "2026-12-31" }
```

| Field | Required | Meaning |
|---|---|---|
| `pluginId` | yes | ZAP plugin id of the alert (the first number in the gate's output line). |
| `url` | no | Only instances whose URL equals this or starts with it. Without it, every instance of the alert. |
| `reason` | yes | Why it is accepted. Not empty. |
| `until` | yes | `YYYY-MM-DD`, today or later. After that date the entry is refused and the job fails again. |

An entry without a reason, with a bad or past `until`, or with no `pluginId` does not ignore anything and
fails the gate. Prefer fixing the finding; an entry is a dated exception, not a fix. Kevin reviews every entry.
