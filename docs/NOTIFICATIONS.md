# Notifications

Every message NextUp sends leaves through one outbox: mails to people and signed webhooks to a company's own systems.
A message is written once, sent through a channel, retried on a schedule, and kept when it fails. Design:
`docs/adr/0004-webhook-and-outbox.md`; the proof is `apps/app/tests/db/outbox.test.ts` (NTF-Z1).

## The outbox

Table `OutboxMessage` (`prisma/schema/integrations.prisma`), helpers in `src/lib/db/outbox.ts`
(`enqueue`, `listOutbox`, `claimDue`, `markSent`, `markRetry`, `markFailed`).

| Column | Meaning |
|---|---|
| `channel` | `mail`, `webhook`, or any name a later `registerChannel` adds |
| `key` | idempotency key, unique per company |
| `recipientUserId`, `address` | the person, and the mail address or the webhook subscription id |
| `template`, `locale`, `subject`, `text`, `link`, `data` | what is sent; text comes from the message catalog |
| `status` | `pending`, `sent`, `failed` or `skipped` |
| `attempt`, `nextAt`, `lastError`, `sentAt` | the delivery's bookkeeping |

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
| loop events (`case.discussion`, `case.invited`, `case.checkin`, `case.asked`, `case.answered`, `case.handed`, `case.decided`, `project.*`) | `loop.<event type>` | `loop:<eventId>:<userId>` |
| `clock.due` (CLK) | `reminder.deadline`, `.checkin`, `.start`, `.measure` | `rem:<eventId>:<userId>` |
| public event (`case.raised`, `case.handed`, `case.answered`, `case.decided`, `project.started`, `project.done`, `project.stopped`) | `webhook` | `wh:<eventId>:<subscriptionId>` |
| the daily digest | `digest` | `digest:<userId>:<workday number>` |

Reminder recipients: deadline, the users of the seat it escalates to and of the case's current seat; checkin, the users
of the case's seat; start and measure, the project's lead. The actor never gets a mail about their own event. A user
without an address (and no Teams chat) still gets the mail row, written as `failed` with "no mail address for <name>",
so Settings → Notifications shows that a notice reached nobody; in a sandbox, or with the switch off, it is `skipped`
like every other row. For a raise, the pairing key `notify:<eventId>` goes to the first holder who can be reached.
Loop mails (`loop.*`) still go only to people with an address. Who gets which is decided by the pure `loopMails`
(`src/features/loop/notice.ts`): a question (`case.asked`) and a no go to the raiser; the answer (`case.answered`) goes to
every holder of the case's desk and to who asked; a pass by a person (`case.handed`) goes to every holder of the new desk
and to the raiser; a yes tells the raiser, and the new lead when it opens a project. A hand-over the clock wrote sends no
loop mail, because its reminder already does. A reminder has the key of the `clock.due` fact, and the clock writes each
fact once, so a deadline gives each recipient one reminder however many days or restarts follow.

## Gating

`gateOf(company, channel, template, pref)` (`src/features/notify/gate.ts`, pure). A message that may not leave is still
written, as `skipped` with the reason in `lastError`, so /admin and tests can see what would have gone out.

| Case | Result |
|---|---|
| stage `sandbox` | every row `skipped`, "sandbox"; nothing leaves |
| `raised`, `loop.*` | sent in demo, pilot and live |
| `reminder.*`, `digest` | only when `CompanyConfig.notifications` is on, else "switched off" |
| `webhook` | only when `CompanyConfig.n8n` is on (the automations switch), else "switched off" |
| `NotifyPreference` with `on` false for the template or `*` | that user's mail is `skipped`, "opted out" |

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
Europe/Berlin, every person who switched the digest on and has at least one case on their desk gets one `digest` row.
The key carries the workday number, so a second run that day writes nothing. Demo companies get none. The digest is
also gated by `CompanyConfig.notifications`.

## Opt-in and opt-out

Each person chooses on their profile page; the choice is a `NotifyPreference` row (`template` or `*`, `on`), read
through `src/lib/db/notify-prefs.ts`. Every template is on by default except `digest`, which is off until the person
turns it on. A person's choice for a template wins over `*`, which wins over the default.

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
