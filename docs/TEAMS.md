# Microsoft Teams

What Teams does in NextUp, how a company switches it on, and what is not built. Plan TMS.

## What it does

- **Notices as cards.** A person who has added the bot gets their notices (a raised case, a deadline reminder) as an
  Adaptive Card in their 1:1 chat instead of as mail. Keys, templates, preferences and gating are the same as for
  mail, so a notice is never sent twice. The daily digest stays mail only.
- **Answer on the card.** The card for a case that sits with the person has buttons: yes, no (with a reason), ask, hand
  over. Each becomes one event (`case.decided`, `case.asked`, `case.handed`) with source `teams`, checked the same way
  as in the app. Teams repeating an activity writes nothing twice.
- **Raise from Teams.** The message extension (`raise`) opens a form, prefilled from the message when started on one, and raises a case with
  source `teams` as the mapped person. A Teams raise has no last look and no desk choice: it takes the router's proposal (the brain's, else
  the keywords') as its route and desk, and when that route has nobody it lands on the fallback desk (the company's fallback desk role, else the
  review role while review is on, else the first manager role's seat; Settings → Rules). A member's raise carries the handle or the name the
  company preselects (Settings → Rules). `server/teams/extension.ts` does this with the same steps as the app's raise.
- **Fallback.** A person without a Teams chat, or any person while Teams is off for the company, gets mail as before.
  A card that cannot be delivered (the bot was removed, Teams refuses it, or it still fails on the third try) is
  written as a mail for the same notice instead; see `docs/NOTIFICATIONS.md`, Delivery and retries.

## Switching it on for a company

Teams works only when all three hold: the stack has `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD` and `TEAMS_TENANT_ID`; the
company has its Microsoft tenant id (set in the console on `/admin/people`, Access → Microsoft, and only shown in Settings -> Sign-in); and Teams is switched on (Settings -> Microsoft Teams).
Then download the app package on that page, install it in Teams, and each person says hello to the bot once. People
are matched by their Entra object id (sign-in), never by name.

## What Kevin sets up in the tenant

Bot registration, endpoint (`/api/<company>/teams/messages`), Teams channel and sideloading: see
[ops/teams/README.md](../ops/teams/README.md). One registration per stack.

## Not built

- Group chats and channels: the bot talks 1:1 only (the extension can be started anywhere).
- `Action.Execute` (universal actions): cards use `Action.Submit`.
- A Teams tab.
