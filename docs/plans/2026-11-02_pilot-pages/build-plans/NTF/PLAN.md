---
id: NTF
project: nextup
title: Notification engine and webhooks
state: active
level: 2
approved:
  [
    { level: 0, by: kevin, at: 2026-11-02, note: Telegram },
    { level: 1, by: kevin, at: 2026-11-02, note: Telegram },
    { level: 2, by: kevin, at: 2026-11-02, note: Telegram }
  ]
milestone: PILOT NTF
summary: "NTF sends every NextUp message through one outbox: the raise and
  discussion mails of today, reminders when a deadline, check-in, start or
  measure falls due (from CLK's facts), an opt-in daily digest, and signed
  webhooks to the company's own systems. Each message is written once with a
  unique key, retried with backoff and then marked failed, so nobody gets a
  reminder twice. A sandbox company sends nothing; reminders and digests go out
  only where the company switched notifications on. Old senders are switched off
  in the same PR that moves them. 6 tasks, 90 % of a window; it starts after CLK
  and AIP."
phases:
  - { id: G, title: Outbox tables, wps: [ G ], gate: auto }
  - { id: W1, title: Planner and delivery, wps: [ A, B ], gate: auto }
  - { id: W2, title: Dispatcher and the switch-over, wps: [ C ], gate: auto }
  - { id: W3, title: Digests and opt-in, wps: [ D ], gate: auto }
  - { id: Z, title: Acceptance, wps: [ Z ], gate: auto }
max_parallel: 1
decisions:
  - {
      id: D1,
      text: "(from PILOT/HD13) Plans, code, comments and PRs are in English."
    }
  - {
      id: D2,
      text: "(from PILOT/HD2 and HD3) Every channel sits behind `NotifyChannel` from
        @nextup/contracts/public
        (packages/contracts/src/public/connectors/notify-channel.ts); the
        webhook body is `WebhookEnvelope` v1 with the signature of
        docs/adr/0004-webhook-and-outbox.md. Contracts are only extended, never
        broken."
    }
  - {
      id: D3,
      text: "(from PILOT/HD4, HD7, HD9) Subscriptions, switches and preferences are
        rows, never code. The core loop never waits for a message: a failed or
        missing notice never fails an append. Every subject and text comes from
        the message catalog in German and English (i18n/messages/mail.ts)."
    }
  - {
      id: D4,
      text: "(from PILOT/HD11 and HD12) NTF changes integrations.prisma (its models
        below) and, in core.prisma, only the `// -- integrations --` block of
        Company (back-relation fields). One migration folder
        apps/app/prisma/migrations/20261120080000_ntf_outbox/. No package.json
        or lockfile change; HMAC with node:crypto, HTTP with fetch."
    }
  - {
      id: D5,
      text: "Tables (integrations.prisma). `OutboxMessage { id String @id
        @default(cuid()); companyId; channel String (mail | webhook | any name a
        later registerChannel adds); key String; recipientUserId String?;
        address String? (mail address or webhook subscription id); template
        String; locale String; subject String; text String; link String?; data
        Json @default(\"{}\"); status String @default(\"pending\") (pending |
        sent | failed | skipped); attempt Int @default(0); nextAt DateTime
        @default(now()); lastError String?; sentAt DateTime?; createdAt DateTime
        @default(now()); @@unique([companyId, key]); @@index([status, nextAt])
        }`; `WebhookSubscription { id; companyId; url String; secrets String[]
        (sealed with features/connectors/vault.ts, context
        \"webhook:<companyId>\"); events String[] (PublicEventType values); on
        Boolean @default(true); createdAt; updatedAt; updatedBy String? }`;
        `NotifyPreference { companyId; userId; template String; on Boolean;
        @@id([companyId, userId, template]) }`; `NotifyCursor { companyId String
        @id; seq Int @default(0); leaseUntil DateTime?; lastRunAt DateTime?;
        lastError String? }`. Each with `company Company @relation(…, onDelete:
        Cascade)` and its back-relation in the integrations block (D4)."
    }
  - {
      id: D6,
      text: "Outbox from the log. `dispatchOnce(now)` (server/notify/dispatch.ts), per
        company under the NotifyCursor lease: read events with seq > cursor in
        seq order, `planNotices` for each, insert the drafts with createMany
        skipDuplicates (the unique key dedupes), move the cursor to the last
        planned seq in the same transaction. A crash re-plans from the old
        cursor and the keys stop duplicates: at least once, never lost, never
        twice for one key. A company's first run starts its cursor at the newest
        seq (no notices for history)."
    }
  - {
      id: D7,
      text: "What becomes a message (`planNotices(ev, ctx): OutboxDraft[]` in
        features/notify/plan.ts, pure; ctx = state, people `{ id, email, locale
        }`, prefs, the company's switches, subscriptions, baseUrl). Templates
        and keys: case.raised → `raised` to the users of the seat it sits on
        (IDN `assigneeRoleHolderId`, `usersOfRole`), key `notify:<eventId>` (the
        key /admin already pairs, features/cases/notice.ts noticeKey) for the
        first such user and `notify:<eventId>:<userId>` for the rest; the loop
        event types of server/loop-notice.ts → their `loopMails` recipients, key
        `loop:<eventId>:<userId>`; `clock.due` → `reminder.<kind>` (deadline:
        the users of the seat it escalates to and of the case's current seat;
        checkin: the users of the case's seat; start and measure: the project's
        lead), key `rem:<eventId>:<userId>`; every public event (D10) →
        `webhook` per subscription that lists its type, key
        `wh:<eventId>:<subscriptionId>`. The actor never gets a mail about their
        own event; a user without an email gets no mail row."
    }
  - {
      id: D8,
      text: "Gating (`gateOf(company, channel, template, pref)` in
        features/notify/gate.ts, pure): stage sandbox → every row is written as
        `skipped` with lastError \"sandbox\" and nothing leaves; templates
        `raised` and `loop.*` go out in demo, pilot and live as today;
        `reminder.*` and `digest` only when CompanyConfig.notifications is true;
        `webhook` only when CompanyConfig.n8n is true (the automations switch);
        a NotifyPreference with on false (for that template or `*`) skips that
        user's mail with lastError \"opted out\"; `digest` is off until the user
        turns it on, every other template on by default."
    }
  - {
      id: D9,
      text: "Delivery (`deliverOnce(now)` in server/notify/deliver.ts): claim up to 50
        pending rows with nextAt <= now (updateMany guard on status and attempt,
        so two instances never send one row twice), send through the registered
        channel, then `sent` with sentAt, or attempt + 1 and nextAt = now + 1
        min, 5 min, 30 min, 2 h, 12 h; after attempt 6 or a non-retryable result
        `failed`, kept for the admin. Channels: `registerChannel(name, channel:
        NotifyChannel)` / `channelFor(name)` in server/notify/registry.ts;
        `mail` wraps server/mail.ts sendMail (and, for template `raised`,
        appends the existing \"noted on the case\" comment with idemKey
        notify:<eventId> after sending, as server/case-notice.ts does);
        `webhook` posts the envelope with 10 s timeout, 2xx = sent, 4xx except
        408 and 429 = not retryable. Without SMTP_URL mail rows wait (pending)
        instead of failing."
    }
  - {
      id: D10,
      text: "Public events (ADR 0005), `toPublicEvents(ev, state): PublicEvent[]` in
        features/notify/public-events.ts, pure: case.raised, case.handed,
        case.answered, case.decided (plus project.started when it opens a
        project), project.started, project.done, project.stopped, typeVersion 1;
        `actor` = { userId: actorUserId, roleId: the actor's seat role or null
        }, `subject` = { kind, id }, only the data fields of the contract; never
        a display name, a handle or a personnel number."
    }
  - {
      id: D11,
      text: "Signing: header `x-nextup-signature: t=<unix s>,v1=<hex>` with one v1 per
        secret of the subscription, HMAC-SHA256 over `signaturePayload(t,
        rawBody)`; `x-nextup-delivery` = deliveryId = the outbox row id;
        `attempt` = the row's attempt + 1 (ADR 0004)."
    }
  - {
      id: D12,
      text: "Digest: on each working day of the company's calendar (CLK `isWorkday`)
        at 07:00 Europe/Berlin, every user with the digest switched on and at
        least one case on their desk (IDN `inboxOf(state, meFor(userId,
        seats))`) gets template `digest`, key `digest:<userId>:<workday
        number>`. Demo companies get no digest."
    }
  - {
      id: D13,
      text: "Old senders: `notifyCaseRaised` and `notifyLoop` are no longer called by
        server/actions/events.ts; the dispatcher plans the same mails.
        `deliverRaisedNotice` (the /admin resend) enqueues the `raised` row for
        that raise and runs one delivery for it, keeping its signature and
        result. Both moves happen in NTF-C1, in one PR (brief risk)."
    }
  - {
      id: D14,
      text: "The loop: `startNotify()` in server/notify/loop.ts runs dispatchOnce then
        deliverOnce every NOTIFY_INTERVAL_MS (default 30 000), guarded by
        globalThis like server/jira-sync.ts, a no-op without a database, started
        from apps/app/instrumentation.ts."
    }
  - {
      id: D15,
      text: "Tests and proofs. Unit tests in apps/app/tests/unit/ntf/ (`npm test -w
        @nextup/app -- tests/unit/ntf/<file> -t '<title>'`); DB tests in
        apps/app/tests/db/ntf-*.test.ts and the acceptance outbox.test.ts, from
        the repo root with
        `DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
        ops/test-db.sh tests/db/<file> -t '<title>'`. Mail in tests goes to a
        channel registered by the test (never SMTP); webhooks to a local
        node:http server on a free port. Time is passed in. Only your own DB
        tests; repeat a red DB run once."
    }
questions:
  - {
      id: Q1,
      text: "Who creates webhook subscriptions before ADM has an editor?",
      default: "lib/db/webhooks.ts saveSubscription is the only way (tests, TST and a
        script); the editor and the failed-messages view are ADM's connector
        settings."
    }
  - {
      id: Q2,
      text: "When does the digest go out?",
      default: "07:00 Europe/Berlin on the company's working days, only with at least
        one case on the desk."
    }
  - {
      id: Q3,
      text: "Should a sandbox company's messages be written at all?",
      default: "Yes, as `skipped` rows with reason \"sandbox\", so a test can see what
        would have gone out; nothing is sent."
    }
autonomy:
  merge: [ low, normal ]
  start_high: true
  replan: none
  budget_window_pct: 90 # tasks 75 % + 20 %
talk:
  telegram:
    [
      question_open,
      blocked_twice,
      proof_red_twice,
      budget_over,
      gate_kevin,
      merge_waiting,
      start_high,
      other_repo,
      plan_done
    ]
  pane: [ blocked, task_merged, phase_done ]
  none: [ task_started ]
---

# NTF Notification engine and webhooks

Sub-plan of PILOT.

## Goal

After NTF, every outgoing message goes through one outbox with mail and webhook channels, respects stage and opt-in,
and sends digests and reminders. On `main` (51a8e43) the raise notice (`server/case-notice.ts`) and the loop mails
(`server/loop-notice.ts`) are fire-and-forget sends after the append: a dead relay loses them, a sandbox company sends
them, nothing retries, and no reminder exists. CLK writes `clock.due` facts; NTF turns them, and every other event,
into outbox rows planned from the log (D6, D7) and delivered with retries (D9).

## Scope

- Outbox, subscriptions, preferences and the dispatcher cursor (D5, D6).
- Planner for raise, loop, reminder and webhook messages (D7) with gating by stage, switches and opt-in (D8).
- `NotifyChannel` registry with `mail` and `webhook`, delivery with backoff and a final `failed` (D9), signed
  webhooks (D10, D11).
- Daily digest and per-user opt-in on the profile page (D12).
- `case-notice.ts` and `loop-notice.ts` moved onto the outbox, old calls removed in the same PR (D13).

**Takes from:** CLK: `clock.due` facts, `isWorkday`, `workdayOf`. IDN: user ids, seats, `usersOfRole`, `inboxOf`.
ARC: `NotifyChannel`, `WebhookEnvelope`, `PublicEvent`. LNG: the catalog. AIP: nothing (NTF waits for it because
`server/actions/events.ts` is AIP-C1's until it merges).

**Hands to:** TMS: `registerChannel("teams", …)` (NTF-B1/B1). API: `toPublicEvents` and the webhook outbox
(NTF-A1/B2, NTF-B1/B2). TST: outbox inspection through `listOutbox(companyId, filter)` (NTF-B1). ADM: subscriptions,
preferences and failed rows to show and edit.

**Not in scope:** Teams (TMS); an editor for subscriptions or a failed-messages view (ADM, Q1); SMS or push.

## Done when

All proofs are green on `main` and all tasks are merged (work 6/6). That covers the brief: a deadline produces
exactly one reminder per recipient, a failed webhook is retried and then marked failed, and a sandbox company sends
nothing (NTF-Z1). The acceptance test `apps/app/tests/db/outbox.test.ts` › `NTF acceptance: reminders once, webhook
retries, sandbox sends nothing` is green.

## Phases

- **G Outbox tables:** the one schema change, needed by every other task.
- **W1 Planner and delivery:** A is pure (what becomes a message, gating, public events); B is the channels and the
  delivery worker. Disjoint files.
- **W2 Dispatcher and the switch-over:** C reads the log into the outbox, starts the loop and switches the old senders
  off in the same PR.
- **W3 Digests and opt-in:** D adds the digest job to C's loop and the opt-in to the profile page.
- **Z Acceptance.**

## Work packages

| WP | Content | Tasks | depends on | Owns |
|---|---|---|---|---|
| G | Four tables, migration, outbox and subscription helpers | NTF-G1 | CLK-Z1, AIP-Z1, LNG-Z1, CNX-Z1, DIR-G1, VIS-G1 | `prisma/schema/integrations.prisma`, `core.prisma` (integrations block), `migrations/20261120080000_ntf_outbox/`, `lib/db/{outbox,webhooks,notify-prefs}.ts` |
| A | Planner, gate, public events, mail texts | NTF-A1 | G | `features/notify/{plan,gate,public-events,templates}.ts`, `i18n/messages/mail.ts` |
| B | Channel registry, mail and webhook channels, signing, delivery | NTF-B1 | G | `server/notify/{registry,deliver,sign}.ts`, `server/notify/channels/**` |
| C | Dispatcher, loop, old senders switched off | NTF-C1 | A, B | `server/notify/{dispatch,loop}.ts`, `instrumentation.ts`, `server/actions/events.ts`, `server/case-notice.ts`, `server/loop-notice.ts` |
| D | Digest job, opt-in on the profile page | NTF-D1 | C | `features/notify/digest.ts`, `server/notify/{digest,loop}.ts`, `server/actions/notify.ts`, `components/profile/{NotifySettings,ProfileView}.tsx`, `i18n/messages/profile.ts` |
| Z | Acceptance | NTF-Z1 | all | `tests/db/outbox.test.ts`, `docs/NOTIFICATIONS.md` |

Paths under `apps/app/src/` unless they start with `prisma/`, `tests/`, `instrumentation.ts` (under `apps/app/`) or
`docs/`.

## Risks

- **Duplicate mails during the move** → the old calls go in the same task that plans the same mails (D13), and the
  raise keeps its existing key `notify:<eventId>`, so a raise already noticed before the switch is not mailed again.
- **The ADR wants outbox rows in the append transaction**, but VIS changes the append path at the same time. → A
  cursor over the log with unique keys gives the same guarantee (D6) without touching `lib/db/events.ts`.
- **A sandbox company stops getting the raise mail** it gets today. → That is the brief ("a sandbox company sends
  nothing"); its rows stay visible as `skipped` (Q3).
- **Pilot companies have `notifications` off by default.** → The switch gates only the new kinds; raise and loop mails
  keep going (D8).
- **Shared files with plans that run at the same time:** `instrumentation.ts` is DIR-C1's → NTF-C1 needs DIR-C1;
  `core.prisma` is DIR-G1's and VIS-G1's → NTF-G1 needs both and adds only its back-relation lines.
- **Budget:** 90 % against 60 % in PILOT: the public event mapper (webhooks are its first user) and the opt-in on the
  profile page were not in the brief.
