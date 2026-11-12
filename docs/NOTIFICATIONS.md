# Notifications

Every message NextUp sends leaves through one outbox: mails to people and signed webhooks to a company's own systems.
A message is written once, sent through a channel, retried on a schedule, and kept when it fails. Design:
`docs/adr/0004-webhook-and-outbox.md`; the proof is `apps/app/tests/db/outbox.test.ts` (NTF-Z1).

## The outbox

Table `OutboxMessage` (`prisma/schema/integrations.prisma`), helpers in `src/lib/db/outbox.ts`
(`enqueue`, `listOutbox`, `claimDue`, `markSent`, `markRetry`, `markFailed`).

| Column | Meaning |
|---|---|
| `channel` | `mail`, `teams`, `webhook`, `inapp` (the person's in-app copy, never delivered), or any name a later `registerChannel` adds |
| `key` | idempotency key, unique per company |
| `recipientUserId`, `address` | the person, and the mail address or the webhook subscription id |
| `template`, `locale`, `subject`, `text`, `link`, `data` | what is sent; text comes from the message catalog |
| `status` | `pending`, `sent`, `failed` or `skipped` |
| `attempt`, `nextAt`, `lastError`, `sentAt` | the delivery's bookkeeping |
| `readAt` | when the person read the notice; only an `inapp` row has one |

The loop (`src/server/notify/loop.ts`, `startNotify()`, every `NOTIFY_INTERVAL_MS`, default 30 s) plans, writes the
digests, then delivers. It is a no-op without a database and never throws.

## Planning: from the log to rows

`dispatchOnce(now)` (`src/server/notify/dispatch.ts`) runs per company under the `NotifyCursor` lease: it reads the
events behind the cursor in `seq` order, calls the pure `planNotices` (`src/features/notify/plan.ts`) for each, writes
the drafts with `createMany skipDuplicates` and moves the cursor in the same transaction. A crash plans again from the
old cursor and the keys stop a second row: at least once, never lost, never twice for one key. A company's first run
starts the cursor at its newest event, so history sends nothing.

## Keys

| Source | Template | Key |
|---|---|---|
| `case.raised`, to the users of the seat it sits on | `raised` | `notify:<eventId>` for the first user, `notify:<eventId>:<userId>` for the rest |
| loop events (`case.discussion`, `case.invited`, `case.checkin`, `case.asked`, `case.answered`, `case.unanswered`, `case.handed`, `case.withdrawn`, `case.decided`, `project.*` including `project.measure.confirmed`) | `loop.<event type>` | `loop:<eventId>:<userId>` |
| `clock.due` (CLK) | `reminder.deadline`, `.checkin`, `.start`, `.measure`, `.escalation`, `.question`, `.triage`, `.confirm` | `rem:<eventId>:<userId>` |
| public event (`case.raised`, `case.handed`, `case.answered`, `case.decided`, `project.started`, `project.done`, `project.stopped`) | `webhook` | `wh:<eventId>:<subscriptionId>` |
| the daily digest | `digest` | `digest:<userId>:<workday number>` (the first outside channel), `…:<channel>` (the second), `…:app` (the in-app copy) |
| the in-app copy of any notice to a person | the notice's own | the event and the person only: `notify:<eventId>:<userId>:app`, `loop:<eventId>:<userId>:app`, `rem:<eventId>:<userId>:app` |
| the month's AI spend first at 70, 90, 100 or 120 % of the cap (decision Q7.6, `server/notify/ai-budget.ts`) | `ai.budget` | `ai.budget:<companyId>:<YYYY-MM>:<level>` for the first recipient, `…:<level>:<userId>` for the rest |

Reminder recipients: deadline, the users of the seat it escalates to and of the case's current seat; checkin, the users
of the case's seat; start and measure, the project's lead; confirm, every manager and every holder of the route's deputy role, or for the second fact the holders of the seat above it names, never the lead or who typed the result; question, the raiser who has not answered; triage, the users of the desk a raise without a route sits on. The actor never gets a mail about their own event. A user
without an address (and no Teams chat) still gets the mail row, written as `failed` with "no mail address for <name>",
so Settings → Notifications shows that a notice reached nobody; in a sandbox, or with the switch off, it is `skipped`
like every other row. For a raise, the pairing key `notify:<eventId>` goes to the first holder who can be reached.
Loop mails (`loop.*`) still go only to people with an address. Who gets which is decided by the pure `loopMails`
(`src/features/loop/notice.ts`): a question (`case.asked`) and a no go to the raiser; the answer (`case.answered`) goes to
every holder of the case's desk and to who asked; a pass by a person (`case.handed`) goes to every holder of the new desk
and to the raiser; a withdrawn idea (`case.withdrawn`) goes to every holder of its desk and everyone invited to its
discussion; a yes tells the raiser, and the new lead when it opens a project. A typed result (`project.measured`) asks every manager and every holder of the route's deputy role to confirm it, before the authors hear the news. The event that closes a project (`closingEvent`, `src/features/projects/close.ts`: the reward, the confirmation of a result that is not better, or the last result or "done" where no reward can follow) sends one summary to the lead, the team and the authors, with the latest result and the recognition; an author gets it in place of the step mail of that event. A stop is not such an event: `project.stopped` tells the lead, the team and the authors who stopped it and the reason given (decision Q6.21), once, for the stop that took effect. A hand-over the clock wrote for a deadline or
an escalation sends no loop mail, because its reminder already does; the one off a desk nobody sits at (`why: "vacant"`)
has no reminder, so the new desk and the raiser get a `loop.case.handed` mail for it. When the clock gives a case back without an answer (`case.unanswered`),
every holder of the desk and who asked are told that it can be decided without the answer, and the raiser that it goes on. A reminder has the key of the `clock.due` fact, and the clock writes each
fact once, so a deadline gives each recipient one reminder however many days or restarts follow.

## Gating

`gateOf(company, channel, template, pref)` (`src/features/notify/gate.ts`, pure). A message that may not leave is still
written, as `skipped` with the reason in `lastError`, so /admin and tests can see what would have gone out.

| Case | Result |
|---|---|
| channel `inapp` | always sent: no stage, switch or choice stops it, it never leaves the stack |
| stage `sandbox` | every outside row `skipped`, "sandbox"; nothing leaves |
| `raised`, `loop.*` | sent in demo, pilot and live |
| `reminder.*`, `digest` | only when `CompanyConfig.notifications` is on, else "switched off" |
| `webhook` | only when `CompanyConfig.n8n` is on (the automations switch), else "switched off" |
| `NotifyPreference` with `on` false for the template or `*` | that user's mail is `skipped`, "opted out"; not for a duty notice (below) |
| `ai.budget` (an operations mail) | sent in pilot and live whatever the switch and the person's choice; `skipped` in a sandbox |

## Delivery and retries

`deliverOnce(now)` (`src/server/notify/deliver.ts`) claims up to 50 due `pending` rows (the claim counts the attempt and
leases the row, so two instances never send one row twice), sends each through its channel and records the outcome:

- sent: `status = sent`, `sentAt` set.
- retryable failure: `attempt + 1` and `nextAt = now` plus 1 min, 5 min, 30 min, 2 h, 12 h after attempts 1 to 5.
- after attempt 6, or a result that is not retryable: `failed`, kept for the admin.
- a hard bounce at the relay (a permanent 5xx, not 503, to RCPT TO or DATA: "550 5.1.1 User unknown") is not
  retryable: the row is `failed` after one try, `lastError` "Hard bounce: …". A soft bounce (4xx: mailbox full,
  greylisting) and a 5xx to MAIL FROM or AUTH (the relay's setup) are retried on the ladder above. A bounce the relay
  sends later by mail (Brevo does this) never reaches the app: the row stays `sent`. Proof: `tests/unit/ntf/mail-bounce.test.ts`
  and `tests/db/outbox.test.ts`, against a local fake relay (`tests/fixtures/smtp/fake-smtp.ts`).
- mail without `SMTP_URL`: the row waits (stays `pending`, no attempt counted) instead of failing.
- a Teams card that cannot be delivered becomes a mail (decision Q2.11): when a `teams` row fails for good, or still
  fails on its third try (about six minutes in), the delivery writes one `mail` row for the same notice to the
  person's address: key `<key>:mail`, the same template, text, link and data plus `insteadOf` (the card's row id).
  The card is then `failed`, with "a mail was written instead" after its error, and is not tried again. A person
  without an address, or who is deactivated, gets no mail row: the card keeps the whole ladder. A retried card that
  fails again finds the key taken, so there is never a second mail. Pure part: `src/features/notify/fallback.ts`;
  proof: `tests/unit/ntf/fallback.test.ts` and `tests/db/tms-channel.test.ts`.

Time is always passed in (`now`), so tests walk a schedule without waiting.

## Channels

A channel is a `NotifyChannel` from `@nextup/contracts/public` (`send(message)` gives `{ ok }` or
`{ ok: false, error, retryable }`). `src/server/notify/registry.ts` holds them by name: `registerChannel(name, channel)`
and `channelFor(name)`.

- `mail` wraps `src/server/mail.ts`. For template `raised` it then appends the "noted on the case" comment with
  idemKey `notify:<eventId>`.
- `webhook` posts the `WebhookEnvelope` to the subscription named by the row's address, signed with every secret
  (`x-nextup-signature: t=<unix s>,v1=<hex>`, `x-nextup-delivery` = the row id), 10 s timeout. 2xx is sent; 4xx except
  408 and 429 is not retryable; the rest is retried.

**How TMS adds a channel:** implement `NotifyChannel` (the Teams adapter), call `registerChannel("teams", channel)` once
at startup, and have the planner (`planNotices`) write drafts with `channel: "teams"`, passing them through `gateOf`.
Delivery, backoff, `failed` and the unique key need no change. Tests register their own channel the same way (the
acceptance test registers a recording `mail` channel; mail never goes to SMTP in tests).

## Digest

`runDigests(now)` (`src/server/notify/digest.ts`): on each working day of the company's calendar, from 07:00
Europe/Berlin, every active person who switched the digest on (and with the company's notifications switch on) and has
something in their inbox gets one `digest`. It lists what `inboxItems` lists for that person, in the inbox's order
(pinned, late, due soon, the rest; decision D18 of plan INB), one line per item with its link, a case that waits for
an answer on one closing line, and a link to `/inbox` (`digestFor`, `src/features/notify/digest.ts`). It follows the
digest group's channel rule (below) and writes one in-app copy. The key carries the workday number, so a second run that
day writes nothing. Demo companies get none. A sandbox company gets the in-app copy and skipped outside rows. The digest
is opt-in and never replaces a duty notice.

## In the app

Every notice to a person is also in the app (decision Q2.9, D5 of plan INB). For every draft with a recipient on `mail`
or `teams`, and for a digest, the planner writes one more row with channel `inapp`, status `sent`, `sentAt` now, and a
key that depends on the event and the person only, so a retry after the company changed its rule writes no second copy.
In-app rows are never gated by stage, switch or opt-out, are never picked by `deliverOnce`, and the person's `readAt`
says it was read. The inbox page (`/inbox`, docs/INBOX.md) lists a person's own, newest first, through
`listNotices(companyId, userId)` in `src/lib/db/notices.ts`; `markNoticesRead(companyId, userId, ids?)` marks the given
ones or all of them, and never another person's. A person with no address and no Teams chat still gets the in-app copy.

## Channel rule per group

The company chooses, per notice group (`NotifyGroup`: `raised`, `loop`, `reminders`, `digest`), one rule in Settings →
Notifications, stored as `CompanyConfig.noticeChannels` (`{ group: rule }`; `noticeChannelFor`,
`src/features/notify/channels.ts`):

| Rule | Rows written |
|---|---|
| `teams-else-mail` (the default for every group, loop included) | a Teams row when Teams is on and the person has a bot chat, else a mail row |
| `mail` | a mail row only; no Teams row, whatever Teams is set to |
| `both` | a mail row and, where the person is reachable on Teams, a Teams row |

A group the company has not set, or a stored value that is not one of the three, falls back to `teams-else-mail`. The
Teams channel sends any template as a text card. Loop notices were mail only before plan INB; with the default rule a
person with a bot chat now gets them in Teams.

## Add mail

A person can ask for mail as well where the rule chose Teams: a `NotifyPreference` row with template `+mail:<group>`
(`ADD_MAIL_PREFIX`) and `on` true, one per group. It adds a mail row next to the Teams row; it changes nothing when the
rule is `mail` or `both`.

## Duty notices

A duty cannot be switched off, only moved between Teams and mail (decision Q2.10, D8 of plan INB). The templates are
`DUTY_TEMPLATES` in `src/features/notify/channels.ts`: `raised`, `reminder.deadline`, `reminder.escalation`,
`reminder.triage`, `reminder.confirm`, `reminder.start`, `reminder.measure`, and the project-draft reminders
`reminder.lead`, `reminder.invite`, `reminder.draft`. `gateOf` ignores a person's opt-out for them, `prefChange` refuses
to switch one off (`duty`), and the profile shows them as "always on". The sandbox stage and the company's notifications
switch still apply as for any outside row; the in-app copy is always written.

## AI budget warning

`warnAiBudget(companyId, now)` (`src/server/notify/ai-budget.ts`) runs after each `AiCall` is written, not awaited
(`recordAiCall`, `src/lib/db/ai-usage.ts`), so a model call's request never waits for it. It reads the month's budget
and, at 70, 90, 100 or 120 % of the euro cap or the token limit (`mailLevelOf`, `src/features/ai/budget-mail.ts`), writes
one `ai.budget` mail per recipient unless the level's key exists for the month. Recipients: the active console admins
(`isStackAdmin`) with an address; without one, the active managers with an address; with nobody, one row without a
recipient, `failed` with "no console admin or manager with a mail address". The text, in the recipient's language
(`mail.aiBudget*`), names the level, spent against the cap, what pauses, and links to `/admin/assistant`. Demo
companies get none. docs/ASSISTANT.md, "The monthly budget", has the levels.

## Opt-in and opt-out

Each person chooses on their profile page; the choice is a `NotifyPreference` row (`template` or `*`, `on`), read
through `src/lib/db/notify-prefs.ts`. Every template is on by default except `digest`, which is off until the person
turns it on. A person's choice for a template wins over `*`, which wins over the default. A template added after
people made their choices (`loop.case.asked`, `loop.case.answered`, `loop.case.handed`, `loop.case.unanswered`, `loop.case.withdrawn`, `loop.project.measure.confirmed`, `loop.project.stopped`, `reminder.question`, `reminder.triage`, `reminder.confirm`) follows the person's row for an
older template of its group while it has none of its own (`followsTemplate` in `src/features/notify/digest.ts`), so an
earlier opt-out covers it; the profile switch writes a row for every template of its group.

## Subscriptions

`WebhookSubscription` rows (`url`, sealed `secrets`, `events`, `on`) are written with `saveSubscription`
(`src/lib/db/webhooks.ts`). The editor and the failed-messages view belong to ADM.

## NTF gaps

Register rows of phase NTF (`docs/audit/gaps/product.md`) and the task that answers each. The acceptance proof is
`apps/app/tests/db/outbox.test.ts` (NTF-Z1).

| Gap | What it said | Answered by |
|---|---|---|
| G-025 | Mail was not gated by stage or opt-in: notices went out whenever `SMTP_URL` was set and `CompanyConfig.notifications` was not read. | NTF-A1 (the gate, D8) and NTF-C1 (the dispatcher plans every mail, the old senders are off); NTF-D1 (per-person opt-out on the profile page). |
| G-026 | No digest and no reminders: every notice was a single mail at the moment of the event. | NTF-A1 (reminder templates from `clock.due`), NTF-C1 (planned into the outbox) and NTF-D1 (the daily digest). |
| G-030 | No outbound webhooks and no outbox: the design was pull only. | NTF-G1 (tables), NTF-B1 (the signed `webhook` channel and delivery with retries), NTF-A1 (public events and the webhook rows). |
