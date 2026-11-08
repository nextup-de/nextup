# Teams live on Musterwerk, 2026-11-08 (PILOT_CHECK G1-G4)

Stack `musterwerk` (https://musterwerk.sellux.ch, stage `real`, image `sha-4d44d91`, company stage `pilot`), test tenant
`nextuptest` (`df4b9f00-…`). Kevin in Teams as himself (manager, English) and as Julia Rossi (`musterwerk-p4`,
Schichtleiterin Linie A, German). Times are UTC. Evidence is the stack's own `CaseEvent` and `OutboxMessage` rows.

**Result:** G1, G2, G3 and G4 pass. G3 found a high defect (TMS-L1 below). G5 was not run.

## Setup, and what was wrong before

| Item | State found | Done |
|---|---|---|
| Azure Bot `nextupbot` (rg `nextup-ai`, F0, single tenant, app id `9d1ecef5-…`) | existed since 2026-11-07, endpoint `/api/musterwerk/teams/messages` right | kept |
| Teams channel on the bot | **missing**: Teams could never reach the bot | added |
| `TEAMS_APP_PASSWORD` in the instance `.env` | **the secret's key id (a GUID), not the secret**: the bot got `401 invalid_client` | new secret appended in Entra, piped from `az` into `add-stack.sh … --teams-app-id … --teams-tenant-id …` under `.setup.lock`. The app was recreated healthy; bot token 200 |
| Teams app package | `ops/teams/` at `4d44d91`, app id and host filled in | org catalog upload: neither the Teams admin center (new app management was still being set up) nor the Teams client offered it, and "Microsoft Graph Command Line Tools" was refused at device-code sign-in. Uploaded through Graph with a temporary app registration (2 delegated scopes, admin consent, deleted afterwards); catalog id `e386bafb-…` |
| Julia | no usage location, no licence | usage location DE, 1 × O365 Business Essentials (includes TEAMS1) |
| Install | none | installed by Graph for Julia and Kevin at 01:05. The bot stored both personal conversations (`TeamsConversation`, service URL `smba.trafficmanager.net/de/…`) and sent the welcome text in each person's language |

## Steps

| Step | What happened | Evidence | Result |
|---|---|---|---|
| G1 test card | Text card to Julia's conversation with the stack's bot credentials (the settings page button sends to the admin only) | Bot Framework `201`, activity `1794099960149`, 01:06:00; Kevin saw it as Julia | pass |
| G2 notice as German card, no duplicate mail | Case raised from Teams (G4 row) lands on Julia's seat | `OutboxMessage` `teams` / `raised` / `de` for `musterwerk-p4`, created 01:09:19, **sent 01:09:48, attempt 1**. No mail row for this case. Earlier, at 00:59 before the install, a web raise for Julia went **by mail** (the fallback) | pass |
| G3 "No" with a reason on the card | Julia: Antworten → Nein → reason → Antwort senden | `CaseEvent` 1129, `case.decided`, actor `musterwerk-p4`, **source `teams`**, idemKey `teams:f:35882259-…`, payload `{"answer":"no","reason":"ist nur verschmuizung"}`, 01:14:40; `CaseView.status = decided` | pass, see TMS-L1 |
| G4 raise from Teams | Kevin: message extension "Raise in NextUp", "Störung an Band A – Förderband steht" | `CaseEvent` 1122, `case.raised`, actor Kevin, **source `teams`**, idemKey `teams:f:69b8037f-…`, route `sto_rung_linie_a` (proposal source `llm`), seat `musterwerk-h4` (Julia), visibility `everyone`, **`fromDept: ""`** | pass for routing and source; the known risk holds: no unit on a Teams raise, so per-unit metrics miss it |

## Findings

- **TMS-L1 (high): a card answer can overwrite a decision already made.** Julia first said no in the web app (01:10:49,
  `case.decided`, source `app`, reason "wrong department"), then pressed No on the still-open card of the same case
  (01:14:40, source `teams`). Both rows were written; the reducer took the second, so the case now carries the Teams reason.
  `server/teams/card-actions.ts` checks only `mayAppend`, which allows a further `case.decided` without a project id
  (`features/cases/permissions.ts` `mayDecide`); the text for this, `teams.refusedAnswered`, exists but nothing uses it.
  This breaks K3 ("replay cannot change the winning decision"). The same may hold for a second web decision; not tested.
  Fix: refuse `case.decided` on a decided case (or at least from the card, with `refusedAnswered`), and turn the card into
  its answered state.
- **TMS-L2 (low): the case history names the wrong channel.** After the Teams notice, event 1123 says
  "Routenverantwortliche Person per E-Mail benachrichtigt."
- **Known G4 risk confirmed:** `fromDept` is empty on Teams raises (`server/teams/extension.ts`), and on API raises.
- **Routing (not Teams):** "Band A läuft nicht, Sensor ist verschmutzt" went to `maintenance` (Elena Neumann), not to
  "Störung Linie A", although "Band A" is one of that route's keywords; the AI proposal wins over the keyword.

## Left open

- G5 (remove the app, next notice by mail) not run.
- The unused first bot secret (made 2026-11-07) is still on the `nextupbot` registration; it can be removed.
- The stack is pinned (`PINNED=4d44d91`); nothing here changed an image.
