# Microsoft Teams

What Teams does in NextUp, how a company switches it on, and what is not built. Plan TMS.

## What it does

- **Notices as cards.** A person who has added the bot gets their notices as an Adaptive Card in their 1:1 chat instead of
  as mail. Keys, templates, preferences and gating are the same as for mail, so a notice is never sent twice. The daily
  digest stays mail only. Six notices have a card of their own; every other template (a project paused, a weekly update,
  an agent's nudge and so on) is sent as a plain text card with its subject, its text and a link.
  - *A raised case* and *a deadline reminder* (to the desk, or to the seat it escalated to): the case, the unit it comes
    from, its route and the answer-by date, and the buttons below.
  - *A case passed on* (`loop.case.handed`): the title, the pass's reason and the buttons Answer (yes, no with a reason,
    ask) and Hand over.
  - *A question to the raiser* (`loop.case.asked`): the title, the question and the button Answer, which sends the
    answer as `case.answered` (the card's `reply` submit). It is there only while the question is open.
  - *A yes or a no* (`loop.case.decided`): the title and the reason; no buttons.
  - *A project step that asks for help* (`loop.project.help.asked`): the project, the step and the ask; no buttons.
  Every card has **Open in NextUp**. A button is on a card only when the web would let this receiver do it: the app asks
  the same `mayAppend` rule for the receiver at the moment it sends (a raiser who is sent a pass notice gets no Answer or
  Hand over, a desk holder gets both), and the submit is checked by the same rule again when it comes back. Idea cards
  have no Yes button; "Say yes in NextUp" leads to the case.
- **Answer on the card.** The card for a case that sits with the person has buttons: yes, no (with a reason), ask, hand
  over. Each becomes one event (`case.decided`, `case.asked`, `case.handed`) with source `teams`, checked the same way
  as in the app; the answer to a question on its card becomes `case.answered`. No card writes an event the app does not.
  Teams repeating an activity writes nothing twice.
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
