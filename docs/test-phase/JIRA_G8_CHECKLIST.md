# Jira G8 live checklist: a revoked token, then a new one

PILOT_CHECK G8 for Jira Cloud on the test site `nextup-test.atlassian.net`, project `KAN`, on the `musterwerk`
stack (NextUp project P-5 ↔ epic KAN-12, steps KAN-14 to KAN-18). About 15 minutes. Fake data only.

The same steps pass against the fake Jira in the tests: `tests/unit/jira-sync.test.ts` ("G8: a revoked token …")
and `tests/db/tst-integrations.test.ts` ("Jira G8: …"). This list checks the real site and the real screens.

Only a person creates and revokes Atlassian tokens. Note the times (UTC) as you go.

## Before

- [ ] The stack runs a release that has the "Jira refused the API token" line (`fix/jira-g8-token`). On an older
  release section 2 shows only "Last error: 401 Unauthorized"; the rest of the list holds the same.
- [ ] /admin → Connectors → Jira shows **On**, "Last round … · last good round …" a minute or two ago, no red line.
- [ ] Write down the label of the token the sync uses now (id.atlassian.com → Security → API tokens).

## 1. Revoke

- [ ] In id.atlassian.com → Security → API tokens, **revoke** the token the sync uses. Time: ______
- [ ] In NextUp, on P-5's board, move one step (say KAN-15) to another column. Time: ______
- [ ] In Jira, move a different step (say KAN-17) and write a comment on epic KAN-12: "G8 while revoked".
- [ ] In Jira, create a new issue under KAN-12: "G8 child while revoked".

## 2. See the error (within about 2 minutes)

| Where | Expected | Seen |
|---|---|---|
| /admin → Connectors → Jira | status **Error**; red line "Jira refused the API token: it has expired or was revoked. Create a new token in Atlassian, enter it above and save. …"; then "Last error: 401 …" and "Cases keep working. Only the sync with Jira waits." | |
| P-5 in NextUp (project page, Jira row) | the chip reads "Sync problem: the Jira token has expired, your admin needs to enter a new one" (German: "Abgleichproblem: das Jira-Token ist abgelaufen, …") | |
| Jira, KAN-15 | **not** moved (nothing reaches Jira while the token is refused) | |
| P-5 board in NextUp | KAN-17's step has **not** moved; no "G8 while revoked" comment; no new step | |
| Cases (raise one, answer one) | work as usual | |

If the screens stay green after 3 minutes, or the step moved anyway, G8 fails: note what was shown. If the last error
starts with something other than `401` or `403` (the fake answers 401, as Atlassian documents for a bad token), the
red line does not appear: note the exact text, that is a finding.

## 3. Set a new token

- [ ] Create a new API token for the same integration account. Time: ______
- [ ] /admin → Connectors → Jira: paste it into "API token", press **Test connection** (all checks green), then **Save**.
  The red line goes away on save.
- [ ] Press **Sync now** (or wait a minute).

## 4. The sync resumes (within about 2 minutes)

| Where | Expected | Seen |
|---|---|---|
| /admin → Connectors → Jira | status On, "last good round" a moment ago, no red line | |
| Jira, KAN-15 | now in the column you moved it to in step 1 (history: by the integration account) | |
| P-5 board in NextUp | KAN-17's step in its new column; a comment "Jira KAN-12: G8 while revoked" (no author); a new step "G8 child while revoked" linked to its issue | |
| A minute later | nothing moves back and forth (no echo) | |

G8 passes when all of section 2 and section 4 hold.

## After

- [ ] Delete the "G8 child while revoked" issue in Jira and remove its step on the board, or leave both and say so in
  the report (the sync never deletes; removing the step adds the label `nextup-removed` and a comment in Jira).
- [ ] Record the result and times in a `JIRA_LIVE_<date>.md` next to this file.
