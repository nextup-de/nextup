# 11 · Defensible offer: new and changed pages

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> "Start here, Sam", its ground rules and its shared building blocks first.**
> The pages that the [defensible-offer plan](../2026-11-02_defensible-offer.md) adds or changes: what the submitter
> sees about the answer date, why a score is what it is, the Gutachter review and the committee, premium rules, the
> premium letter and the payroll file, the ZI KPI report, results from data sources, the works-council pack, the
> read-only oversight page and the benchmark. It also lists what is **removed**: the contributor ranking and the
> person pages. **9 new pages, 7 changed pages, 2 routes removed, 5 other surfaces.**

Context for this file:

- **Who does what.** Kevin's side (through Codex tasks in
  [2026-11-02_defensible-offer-codex.md](../2026-11-02_defensible-offer-codex.md)) builds the data, the rules and the
  server actions. You design and build the pages. Each page's *Phase* line names the task that builds its data; a
  page whose task is not merged is designed now and built later (rule 4 of "Start here").
- **Describe needs, not looks.** As in every spec: the content, actions, states, rules and names in code are fixed;
  the ASCII layouts are suggestions.
- **The rules that matter most here:**
  - **No person ranking, no person metric (HD5).** No page in this file shows a count, a speed or a list of "top"
    anything per person: not per raiser, not per reviewer, not per committee member, not per premium earner.
    Premiums are shown to the people they belong to and to the payroll role, never as a list on a shared page.
  - **No model output in a number (DO2).** A score part, a review mark, a premium, a KPI or a benchmark cell is never
    an AI value. Where the AI proposed something (a route, a suggested answer, a translation), the page says so.
  - **Too few to show (DO3).** Every breakdown by unit or role uses `TooFewToShow` below 5 people; every
    cross-company number below 5 companies.
  - **The AI can be off (HD7).** Translation and AI routes have an "AI off" version.
  - **The personnel number is never shown (HD14)**, not even on the payroll page (it is only inside the file).
- **Text namespaces** *(proposal)*: `cases` (answer date, why this score, translation), `review` (review pages and
  dialogs), `committee`, `premium` (rules, letter, payroll), `kpis`, `projects` (measure card), `pack`
  (works-council pack, oversight), `bench`, `settingsRules` (the new switches).
- **Test ids:** `case-promise-<thing>`, `case-score-<thing>`, `review-<thing>`, `committee-<thing>`,
  `settings-premium-<thing>`, `settings-payroll-<thing>`, `kpis-<thing>`, `project-measure-<thing>`,
  `settings-pack-<thing>`, `oversight-<thing>`, `settings-bench-<thing>`.

## Pages in this file

| Page | Route | New / changed | Data from | Section |
|---|---|---|---|---|
| Case page: answer date and deputy status | `/cases/[caseId]` | changed (04) | CORE-S1, CORE-H1, CLK | [Answer date and deputy status](#answer-date-and-deputy-status) |
| My cases: answer date column | `/team` (My cases) | changed (04) | CORE-S1 | [Answer date and deputy status](#answer-date-and-deputy-status) |
| Case page and raise last look: why this score | `/cases/[caseId]`, `/raise` | changed (04) | TRUTH-D1, TRUTH-E1 | [Why this score](#why-this-score) |
| Reviews (my review requests) | `/reviews` | new | BVW-A1, BVW-B1 | [Gutachter review](#gutachter-review) |
| Review a case | `/reviews/[caseId]` | new | BVW-A1, BVW-B1 | [Gutachter review](#gutachter-review) |
| Committee | `/committee` | new | BVW-C1 | [Committee](#committee) |
| Premium rules | `/settings/premium` | new | BVW-D1, BVW-E1 | [Premium rules](#premium-rules) |
| Project page: reward and premium letter | `/projects/[projectId]` | changed (10) | BVW-E1, BVW-F1 | [Reward and premium letter](#reward-and-premium-letter) |
| Payroll export | `/settings/payroll` | new | BVW-F1 | [Payroll export](#payroll-export) |
| ZI KPI report | `/kpis` | new | BVW-G1 | [ZI KPI report](#zi-kpi-report) |
| Case page: idea content in your language | `/cases/[caseId]` | changed (04) | BVW-H1 | [Idea content in your language](#idea-content-in-your-language) |
| Project page: measure card | `/projects/[projectId]` | changed (10) | PROOF-A1, PROOF-B1, PROOF-C1 | [Measurement from data sources](#measurement-from-data-sources) |
| Rules: new settings | `/settings/rules` | changed (01) | CORE-H1, BVW-B1, BVW-C1, BVW-F1, PROOF-B1, PROOF-C1 | [Rules: new settings](#rules-new-settings) |
| Works-council pack | `/settings/works-council` | new | PACK-A1, PACK-B1, PROOF-D1 | [Works-council pack](#works-council-pack) |
| Oversight | `/oversight` | new | PACK-C1 | [Oversight](#oversight) |
| Benchmark | `/settings/benchmark` | new | BENCH-A1, BENCH-B1 | [Benchmark](#benchmark) |
| Dashboard: benchmark card | `/dashboard` | changed (04) | BENCH-B1 | [Benchmark](#benchmark) |
| Progress: ranking removed | `/progress` | changed (10) | TRUTH-A1 | [Removed](#removed-contributor-ranking-and-person-pages) |
| Person pages | `/people/[name]`, `/demo/people/[name]` | **removed** | TRUTH-B1 | [Removed](#removed-contributor-ranking-and-person-pages) |
| Data and privacy, Audit log | `/settings/privacy`, `/settings/audit` | no new page: deltas to 05 | TRUTH-F1, CORE-X1, CORE-P1 | [Data protection deltas](#data-protection-deltas-to-05) |

Other surfaces: the printable premium letter, and four dialogs (request a review, decide in committee, confirm a
result, import a KPI file).

---

## Answer date and deputy status

- **Route:** `/[company]/cases/[caseId]` (status line at the top), `/[company]/team` (My cases, one column)
- **Who:** the raiser sees it on their own cases; the desk and managers see the same line.
- **Phase:** CORE-S1 (`answerPromise()` in `features/cases/promise.ts`), CORE-H1 (deadline hand-over, company rule
  `deadline_handover`), CLK (working days, `dateOfWorkday`).
- **Data:** `AnswerPromise = { dueDay, dueDate (ISO, null in demo), state: waiting | due-today | late |
  answered-on-time | answered-late, holder: owner | deputy, holderRoleId, answeredDay }`; the holder role's title
  and its seat (role first, person second, HD5); the company's `promise_days`.
- **Today:** spec 04's case page shows dates (CLK-B1) but no promise line; the raiser cannot see by when to expect an
  answer or that the deputy has it.

**Purpose:** the raiser knows, without asking, by when the answer is due and who has the case now.

### Layout (case page, top)

```
← Back                                                     C-1042
Forklift charging blocks aisle 3                       [ Waiting ]
┌ InfoPanel ───────────────────────────────────────────────────────┐
│ Answer by   Fri 14 Nov  ·  2 working days left                   │
│ With        Quality lead Süd · L. Brandt                         │
└──────────────────────────────────────────────────────────────────┘
```

After a breach with `deadline_handover` on:

```
│ Answer by   Fri 14 Nov  ·  late since Mon 17 Nov                 │
│ With        Deputy plant manager Süd · M. Keller                 │
│             Handed over on Mon 17 Nov because the answer date     │
│             passed.                                               │
```

My cases: one column "Answer by" with the date, or the state chip (Answered, Late).

### Phone

The `InfoPanel` stays at the top, two rows stacked; My cases shows the date under the title line.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Answer by (waiting) | `InfoPanel` row | `dueDate`, working days left | Answer by · {date} · {n} working days left | Antwort bis · {date} · noch {n} Arbeitstage |
| Due today | row, amber text | state `due-today` | Answer by · today | Antwort bis · heute |
| Late | row, red number only | state `late` | Answer by · {date} · late since {date} | Antwort bis · {date} · überfällig seit {date} |
| Answered | row | `answered-on-time` / `answered-late` | Answered on {date} · within the promise / after the promise | Beantwortet am {date} · fristgerecht / nach der Frist |
| With | row | holder role then seat; a vacant seat says so | With · {role} · {person} | Bei · {role} · {person} |
| Hand-over note | hint under "With" | `holder: deputy` after `case.handed {why: "deadline"}` | Handed over on {date} because the answer date passed. | Am {date} übergeben, weil das Antwortdatum verstrichen war. |
| Flag only (rule off) | hint | `holder: owner`, escalated | The deputy was told on {date}; the case stays with {role}. | Die Vertretung wurde am {date} informiert; der Fall bleibt bei {role}. |
| Demo company | row | `dueDate: null` | Answer by · day {n} of the demo | Antwort bis · Tag {n} der Demo |
| My cases column | column head, chip | | Answer by | Antwort bis |

### States

- Waiting, due today, late with the owner (rule off), late and handed to the deputy, answered on time, answered late.
- Vacant holder seat: "With · {role} · nobody yet - a manager sets this up." / "Bei · {role} · noch niemand - eine
  Führungskraft richtet das ein."
- Demo company (day numbers).

### Done when

- [ ] Case page frames (desktop and phone) for all six states and the vacant seat; My cases with the column.
- [ ] Never a person's name before their role.

---

## Why this score

- **Route:** `/[company]/cases/[caseId]` (a panel opened from the score), `/[company]/raise` (the last look before
  publishing, spec 04 "Raise: publishing step")
- **Who:** everyone who may open the case; on the raise page, the author.
- **Phase:** TRUTH-D1 (`scoreCase` parts, `routeSourceOf`: keywords, person or llm), TRUTH-E1 (`fromSuggestions`
  on the `scores` event, `factProvenance`).
- **Data:** the score `{ value, parts: { label, points }[] }`; the route source; `{ facts, fromSuggestions }`.
- **Today:** the score is a number with dots; the parts exist but are not explained; nothing says that a route was
  proposed by the AI or that facts came from suggested answers.

**Purpose:** anyone can see that the score is arithmetic over facts, which fact gave which points, and what came from
the AI or a suggestion.

### Layout (panel)

```
Why this score: 72
┌ InfoPanel ────────────────────────────────────────────┐
│ Fits a decision type on the map              +20       │
│ Upside stated                                +15       │
│ Described in detail                          +10       │
│ Waiting 4 days                                +4       │
│ Route proposed by AI - adds no points          0       │
│ Base                                          35       │
└───────────────────────────────────────────────────────┘
2 of 5 facts came from suggested answers.
The score is computed from the case's facts. No AI output changes it.
```

### Phone

Bottom sheet with the same list.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title | sheet title | | Why this score: {value} | Warum diese Punktzahl: {value} |
| Part rows | label + points, tabular | from `parts`; labels come from the catalog (the score labels move out of `scoring/index.ts` into `cases`) | Fits a decision type on the map · Upside stated · Described in detail · Waiting {n} days · Past the promise · Affects {n} more · Evidence attached · New information | Passt zu einer Entscheidungsart der Karte · Nutzen genannt · Ausführlich beschrieben · Wartet seit {n} Tagen · Über der Frist · Betrifft {n} weitere · Belege angehängt · Neue Informationen |
| AI route row | label, 0 points | source `llm` | Route proposed by AI - adds no points | Route von der KI vorgeschlagen - zählt keine Punkte |
| Base | row | 35 | Base | Grundwert |
| Suggestions line | hint | `fromSuggestions > 0` | {n} of {total} facts came from suggested answers. | {n} von {total} Fakten stammen aus Antwortvorschlägen. |
| Footer | hint | fixed | The score is computed from the case's facts. No AI output changes it. | Die Punktzahl wird aus den Fakten des Falls berechnet. Keine KI-Ausgabe verändert sie. |
| Raise: suggestion chip | chip label | each suggested answer under the coach; no "+12" gain number any more | Suggested · Suggested by AI | Vorschlag · Vorschlag der KI |

### States

- Keyword route, AI route, person-chosen route ("Route chosen by {role}"), no route; no facts from suggestions;
  AI off (no AI rows at all).

### Done when

- [ ] Panel (desktop) and sheet (phone) for an AI route with two facts from suggestions, and for a keyword route with
      none; the raise page's suggestion chips without a gain number.

---

## Gutachter review

Two pages and one dialog.

### Request a review (dialog on the case page)

- **Who:** the case's desk or a manager. **Phase:** BVW-B1 (`requestReview`). The reviewer is picked from the
  company's active members by role and seat (HD10); the raiser and the desk holder are not offered.
- **Content:** title "Ask for a review" / "Gutachten anfordern"; reviewer picker "Reviewer" / "Gutachter·in"; the due
  date computed by the server, shown read-only "Due {date} ({n} working days)" / "Fällig am {date} ({n}
  Arbeitstage)"; buttons Cancel · Ask for review / Abbrechen · Gutachten anfordern. Toast "Review requested from
  {role} · {person}." / "Gutachten bei {role} · {person} angefordert."
- **Test ids:** `review-request-reviewer`, `review-request-submit`.

### Reviews

- **Route:** `/[company]/reviews` (new)
- **Who:** anyone with at least one review request; the nav item shows only then.
- **Phase:** BVW-A1, BVW-B1 (`reduceReviews`)
- **Data:** the viewer's open and submitted reviews: case title, raised date, due date, state (open, late,
  submitted, withdrawn).
- **Purpose:** a reviewer sees what waits for their assessment and by when.

```
Reviews
Cases you were asked to assess.
┌──────────────────────────────────────────────────────────────┐
│ Forklift charging blocks aisle 3     due Fri 14 Nov  [ Open ] │
│ Second scrap bin at line 2           due Mon 10 Nov  [ Late ] │
│ Shared torque wrench pool            submitted 3 Nov          │
└──────────────────────────────────────────────────────────────┘
```

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title, lead | `PageHeader` | | Reviews · Cases you were asked to assess. | Gutachten · Fälle, zu denen du ein Gutachten abgeben sollst. |
| Rows | `DataTable` | open first, by due date | due {date} · submitted {date} | fällig am {date} · abgegeben am {date} |
| State | `StatusBadge` | Open = Setting up, Late = Error, Submitted = On, Withdrawn = Off | Open · Late · Submitted · Withdrawn | Offen · Überfällig · Abgegeben · Zurückgezogen |
| Empty | `EmptyState` | | No reviews for you right now. | Gerade keine Gutachten für dich. |

### Review a case

- **Route:** `/[company]/reviews/[caseId]` (new)
- **Who:** the holder of the requested reviewer seat only; everyone else gets not-found.
- **Phase:** BVW-A1 (`ReviewForm`, `DEFAULT_FORM`), BVW-B1 (`submitReview`)
- **Data:** the case (title, text, upside, attachments count, answer date), the company's form (criteria with label,
  weight and scale; `needsSaving`), the reviewer's draft (kept in the page until submitted).
- **Purpose:** assess a case on the company's criteria and recommend yes, no or rework.

```
Review: Forklift charging blocks aisle 3                  due Fri 14 Nov
┌ The case ─────────────────────────┐ ┌ Your assessment ─────────────────┐
│ (case text, read-only)            │ │ Benefit (30 %)        0 1 2 3 4  │
│                                   │ │ Feasibility (20 %)    0 1 2 3 4  │
│                                   │ │ Cost to implement     0 1 2 3 4  │
│                                   │ │ Safety and quality    0 1 2 3 4  │
│                                   │ │ Scope (10 %)          0 1 2 3 4  │
│                                   │ │ Saving in the first year  [ € ]  │
│                                   │ │ Recommendation ( Yes | No |      │
│                                   │ │                  Rework )        │
│                                   │ │ Note  [                        ] │
│                                   │ │ Result 68 of 100   [ Submit ]    │
└───────────────────────────────────┘ └──────────────────────────────────┘
```

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Criteria | segmented 0-4 (or 0-10 per form) | every criterion required; label from the form in the viewer's language | {criterion} ({weight} %) | {criterion} ({weight} %) |
| Saving | number, € | required when `needsSaving`; ≥ 0 | Saving in the first year · Leave empty if it cannot be put in euros. | Einsparung im ersten Jahr · Leer lassen, wenn sie sich nicht in Euro angeben lässt. |
| Recommendation | segmented | required | Recommendation · Yes · No · Rework | Empfehlung · Ja · Nein · Überarbeiten |
| Note | text area, ≤ 2,000 | required for No and Rework | Note · Why, in a few sentences. | Begründung · Warum, in wenigen Sätzen. |
| Result | computed line | weighted mean, live, arithmetic only | Result {n} of 100 | Ergebnis {n} von 100 |
| Submit | primary | asks first: "Submit your assessment? You cannot change it afterwards." / "Gutachten abgeben? Danach lässt es sich nicht mehr ändern." | Submit | Abgeben |

**States:** loading; open; late (red due date); submitted (read-only, "Submitted on {date}"); withdrawn ("This
review was withdrawn on {date}: {why}"); not the reviewer (not-found).

**Done when:** [ ] request dialog; [ ] Reviews list with all four states and empty; [ ] review page open, late,
submitted, phone layout (case first, assessment below).

---

## Committee

- **Route:** `/[company]/committee` (new)
- **Who:** holders of the company's committee role (`committee_role_id`, set on Rules); managers read-only.
- **Phase:** BVW-C1 (`committeeAgenda`, `decideInCommittee`, event `committee.decided`)
- **Data:** the agenda (cases whose reviews are all in and that have no decision, oldest first) with each case's
  weighted review result, the recommendations ("2 yes, 1 rework"), the assessed saving; the last decisions with
  minutes.
- **Purpose:** the committee decides on reviewed cases and keeps minutes, and the decision moves the case on.

```
Committee
3 cases are ready for a decision.
┌ Agenda ──────────────────────────────────────────────────────────────┐
│ Forklift charging blocks aisle 3   result 68 · 2 yes, 1 rework        │
│   saving €4,200 · waiting 9 working days            [ Decide ]       │
│ …                                                                    │
└──────────────────────────────────────────────────────────────────────┘
┌ Decided ─────────────────────────────────────────────────────────────┐
│ 4 Nov · Shared torque wrench pool · Yes · minutes                     │
└──────────────────────────────────────────────────────────────────────┘
```

**Decide dialog:** answer Yes / No / Later; attendees (seats of the committee role, all ticked by default); minutes
(text area, ≤ 4,000, required); an optional premium note. Text: "Decide on {title}" / "Entscheidung zu {title}";
"Minutes" / "Protokoll"; "Present" / "Anwesend"; "Premium note (optional)" / "Hinweis zur Prämie (optional)";
buttons Cancel · Record decision / Abbrechen · Entscheidung festhalten. Toast "Decision recorded. {role} is told." /
"Entscheidung festgehalten. {role} wird informiert."

| Element | EN | DE |
|---|---|---|
| Lead | {n} cases are ready for a decision. | {n} Fälle sind bereit für eine Entscheidung. |
| Result line | result {n} · {yes} yes, {no} no, {rework} rework | Ergebnis {n} · {yes} Ja, {no} Nein, {rework} Überarbeiten |
| Empty agenda | Nothing to decide. Cases appear here once their reviews are in. | Nichts zu entscheiden. Fälle erscheinen hier, sobald ihre Gutachten vorliegen. |
| Not set up | The committee is not set up yet. A company admin picks its role under Rules. | Der Ausschuss ist noch nicht eingerichtet. Eine Admin-Person wählt seine Rolle unter Regeln. |

**Rules:** no per-member vote counts or attendance statistics (HD5); attendees are listed only inside one decision's
minutes. **Done when:** [ ] agenda, empty agenda, not set up, decide dialog, decided list with minutes, phone.

---

## Premium rules

- **Route:** `/[company]/settings/premium` (new; group "Company")
- **Who:** company admins.
- **Phase:** BVW-D1 (`PremiumRule`, `validatePremiumRule`, `premiumFor`), BVW-E1 (`savePremiumRuleAction`)
- **Data:** the company's `PremiumRule`; a live example computed with `premiumFor`.
- **Today:** `/admin` sets the reward kind (`none | thanks | fixed | share`); the company sees nothing.

**Purpose:** set the premium formula of the works agreement once, and see what it pays in an example.

```
Premium rules
How Acme Automotive rewards an implemented idea, as the works agreement says.
┌ Formula ─────────────────────────────────────────────────────────────┐
│ Kind          ( None | Thanks | Fixed | Share of saving | Points )   │
│ Share         [ 15 ] % of the  ( net | gross ) saving in year one    │
│ Minimum       [ 50 ] €     Maximum   [ 10,000 ] €    Round to [ 5 ] €│
│ Points        result ≥ 80 → 30 points · ≥ 60 → 20 · ≥ 40 → 10        │
│               [ 10 ] € per point                                      │
│                                                           [ Save ]   │
└──────────────────────────────────────────────────────────────────────┘
┌ Example ─────────────────────────────────────────────────────────────┐
│ Saving €12,000 - cost €2,000 = net €10,000 → 15 % = €1,500            │
│ Two authors: €750 each                                                │
│ A premium is due only after a confirmed better result.                │
└──────────────────────────────────────────────────────────────────────┘
```

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Kind | segmented | | None · Thanks · Fixed · Share of saving · Points | Keine · Dank · Fester Betrag · Anteil an der Einsparung · Punkte |
| Share | number % + segmented | 1-50 % | Share · % of the · net · gross · saving in year one | Anteil · % der · Netto- · Brutto- · Einsparung im ersten Jahr |
| Min, max, rounding | numbers | min ≤ max; rounding 1, 5, 10, 50 | Minimum · Maximum · Round to | Mindestbetrag · Höchstbetrag · Runden auf |
| Points table | rows of result ≥ / points | 1-6 rows, falling | result ≥ {n} → {p} points · € per point | Ergebnis ≥ {n} → {p} Punkte · € pro Punkt |
| Example | `InfoPanel` | computed by `premiumFor`, never typed | (as drawn) | (entsprechend) |
| Rule line | hint | fixed (TRUTH-G1, PROOF-B1) | A premium is due only after a confirmed better result. | Eine Prämie ist erst nach einem bestätigten besseren Ergebnis fällig. |

**Actions:** Save (toast "Saved"); an invalid rule shows the field error from `validatePremiumRule`.
**States:** each kind; invalid; loading. **Done when:** [ ] every kind with its example; phone.

---

## Reward and premium letter

- **Route:** `/[company]/projects/[projectId]` (the reward card of spec 10's project page), plus a printable letter
- **Who:** the card: the project's lead, its authors and managers; the amount lines: each author sees their own
  line, managers all lines. The letter: each author their own.
- **Phase:** BVW-E1 (the stamped `project.rewarded` payload: `amount`, `lines`, `parts`), BVW-F1 (`project.paid`),
  TRUTH-G1 / PROOF-B1 (due only after a confirmed better result).
- **Changes on the project page:** the reward card shows the computed amount and how it was computed (from `parts`),
  "Due" only after a confirmed better result, then "Recorded", then "Paid with the {month} payroll". Managers no
  longer type an amount: *Record reward* shows the computed one and asks to confirm.

| Element | EN | DE |
|---|---|---|
| Not due yet | A premium is due after a confirmed better result. | Eine Prämie ist nach einem bestätigten besseren Ergebnis fällig. |
| Due | Premium due: {amount} · {basis} | Prämie fällig: {amount} · {basis} |
| Basis examples | 15 % of the net saving of {saving} · 20 points × {eur} | 15 % der Nettoeinsparung von {saving} · 20 Punkte × {eur} |
| Recorded | Recorded on {date} by {role} | Am {date} von {role} festgehalten |
| Paid | Paid with the {month} payroll | Mit der Abrechnung {month} ausgezahlt |
| Your share | Your share: {amount} | Dein Anteil: {amount} |
| Letter button | Premium letter | Prämienschreiben |

**Premium letter (printable, the browser's print view):** company name, date, the author's name, the idea's title,
the decision date and the committee, the measured result and its source, the formula line, the author's amount,
"The amount is paid with your next payroll." / "Der Betrag wird mit deiner nächsten Abrechnung ausgezahlt.", and
the line of the person who recorded it (role first). No personnel number. One A4 page.

**Done when:** [ ] card in its four states; [ ] letter for one of two authors.

---

## Payroll export

- **Route:** `/[company]/settings/payroll` (new; group "Company")
- **Who:** holders of the payroll role (`payroll_role_id`) and company admins (admins see the settings, only the
  payroll role downloads).
- **Phase:** BVW-F1 (`exportPayroll`, profiles `sap-hcm-0015`, `successfactors`, `datev-lodas`), open question DQ2
  (HD14 exception for this file).
- **Data:** profile, wage type, payroll role; the period; the count and sum of premiums due and unpaid; authors
  missing a personnel number (named, so HR can fix the directory: names only, never numbers); the last exports
  (date, period, count, sum, by role).

```
Payroll export
Premiums for the payroll system. The file holds personnel numbers; it is never shown here.
┌ Setup ───────────────────────────────────────────────────────────────┐
│ Format       ( SAP HCM, infotype 0015 | SuccessFactors | DATEV )      │
│ Wage type    [ 4711 ]          Who exports   [ Payroll Süd ▾ ]        │
└──────────────────────────────────────────────────────────────────────┘
┌ November 2026 ───────────────────────────────────────────────────────┐
│ 6 premiums · €4,350                                                  │
│ 1 author has no personnel number: T. Vogel - ask HR to fix the        │
│ directory. Their premium stays for the next export.                   │
│                                                [ Download CSV ]      │
└──────────────────────────────────────────────────────────────────────┘
Last exports: 3 Oct · September · 4 premiums · €2,100 · Payroll Süd
```

| Element | EN | DE |
|---|---|---|
| Lead | Premiums for the payroll system. The file holds personnel numbers; it is never shown here. | Prämien für das Abrechnungssystem. Die Datei enthält Personalnummern; hier werden sie nie angezeigt. |
| Missing | {n} author(s) have no personnel number: {names}. Ask HR to fix the directory. Their premium stays for the next export. | {n} Person(en) ohne Personalnummer: {names}. Bitte die Personalabteilung, das Verzeichnis zu ergänzen. Ihre Prämie bleibt für den nächsten Export. |
| Download | Download CSV | CSV herunterladen |
| Confirm | Export {n} premiums for {month}? They are marked as paid and leave the next export. | {n} Prämien für {month} exportieren? Sie werden als ausgezahlt markiert und fehlen im nächsten Export. |
| Nothing due | No premiums to pay for {month}. | Für {month} sind keine Prämien auszuzahlen. |

**States:** not set up; nothing due; due with and without missing numbers; not the payroll role (download hidden,
"Only {role} downloads the file."). **Done when:** [ ] all states, confirm dialog, phone.

---

## ZI KPI report

- **Route:** `/[company]/kpis` (new; managers and the oversight role)
- **Phase:** BVW-G1 (`ziKpis`), MET (period picker, CSV, baseline: reuse MET's when built)
- **Data:** per period and unit: participation %, ideas per 100 employees, implementation %, median working days to
  decision, net savings €, premiums €; `hidden` cells.
- **Purpose:** the figures an ideas manager reports to management and the ZI, per unit, with small units hidden.

```
Idea management figures                         [ 2026 ▾ ] [ Export CSV ]
┌ Company ─────────────────────────────────────────────────────────────┐
│ 23 %          14            41 %           6 days       €182,000      │
│ took part     ideas per     implemented    to decision  net savings   │
│               100 people                                              │
└──────────────────────────────────────────────────────────────────────┘
Unit              Took part  Ideas/100  Implemented  To decision  Savings
Werk Süd › Quality   31 %       19          44 %        5 days    €61,000
Werk Süd › Logistics  Too few to show
```

| Element | EN | DE |
|---|---|---|
| Title | Idea management figures | Kennzahlen Ideenmanagement |
| Tiles | took part · ideas per 100 people · implemented · days to decision · net savings · premiums paid | haben teilgenommen · Ideen pro 100 Beschäftigte · umgesetzt · Tage bis zur Entscheidung · Nettoeinsparung · ausgezahlte Prämien |
| Footnote | Counted per unit, never per person. Units with fewer than 5 people are hidden. Savings count only confirmed better results. | Gezählt pro Einheit, nie pro Person. Einheiten mit weniger als 5 Personen werden ausgeblendet. Einsparungen zählen nur bestätigte bessere Ergebnisse. |

**States:** loading; whole company too small (every tile `TooFewToShow`); projects off (savings and premiums show
"Projects are off for {company}."); a hidden unit row. **Done when:** [ ] desktop and phone, hidden unit, too-small
company.

---

## Idea content in your language

- **Route:** `/[company]/cases/[caseId]` (a line above the case text)
- **Who:** everyone who may open the case.
- **Phase:** BVW-H1 (`showTranslation`, `translationFor`, AI gate purpose `translate`)
- **Content:** when the case's language differs from the viewer's: "Written in {language}. [Show in {your
  language}]" / "Geschrieben auf {language}. [Auf {your language} anzeigen]". After switching: a grey line
  "Translated by AI from {language}. [Show original]" / "Von der KI aus dem {language} übersetzt. [Original
  anzeigen]". AI off: "Written in {language}. Translation is off for {company}." / "Geschrieben auf {language}. Die
  Übersetzung ist für {company} aus." The score, route and decision always refer to the original.
- **States:** same language (no line); offered; loading; translated; AI off; failed ("Could not translate. Try
  again." / "Übersetzung fehlgeschlagen. Nochmal versuchen.").
- **Done when:** [ ] the five states on desktop and phone.

---

## Measurement from data sources

- **Route:** `/[company]/projects/[projectId]` (the Measure card of spec 10's project page)
- **Who:** the project lead records; a second person confirms (manager, the lead's deputy role or the controller
  role).
- **Phase:** PROOF-A1 (`MeasureSource`, `parseKpiCsv`, `importMeasures`), PROOF-B1 (`project.measure.confirmed`),
  PROOF-C1 (`METRIC_PRESETS`, emission factor)
- **Changes:**
  - Baseline: pick a preset metric (scrap %, scrap parts, rework hours, downtime minutes, energy kWh, CO₂e kg, lead
    time, cost €) with its fixed unit and direction, or "Other" with free text as today.
  - Each check: **Import from a file** (CSV export of MES, a scrap or energy report) or **Type the number**. An
    imported value shows its file name; a typed value shows "Typed by {role} · not confirmed" until confirmed.
  - **Confirm result** for the second person: "Confirm {value} for the {n}-day check? You confirm that the number is
    right, not that the project was good." / "{value} für die {n}-Tage-Prüfung bestätigen? Du bestätigst, dass die
    Zahl stimmt, nicht dass das Projekt gut war."
  - The verdict shows "Not confirmed yet" and no premium is due until then.
  - Energy: the CO₂e equivalent under the kWh value, "≈ {kg} kg CO₂e at {factor} kg per kWh".

| Element | EN | DE |
|---|---|---|
| Source line (import) | From {file} · imported {date} | Aus {file} · importiert am {date} |
| Source line (typed) | Typed by {role} · not confirmed · Confirmed by {role} on {date} | Eingegeben von {role} · nicht bestätigt · Bestätigt von {role} am {date} |
| Import dialog | Import a KPI file · CSV with date, metric and value · {n} rows read, {e} with errors (line {l}: {reason}) · Use {value} from {date} | KPI-Datei importieren · CSV mit Datum, Kennzahl und Wert · {n} Zeilen gelesen, {e} fehlerhaft (Zeile {l}: {reason}) · {value} vom {date} übernehmen |
| Lead cannot confirm | Someone other than the project lead confirms this number. | Eine andere Person als die Projektleitung bestätigt diese Zahl. |

**States:** no baseline; preset baseline; typed unconfirmed; confirmed; imported; import with errors; worse result
(shown, never hidden). **Done when:** [ ] the card in each state, the import dialog with an error line, the confirm
dialog, phone.

---

## Rules: new settings

- **Route:** `/[company]/settings/rules` (spec 01 "Rules"; new cards at the end)
- **Phase:** CORE-H1 (`deadline_handover`), BVW-B1 (`review_form`), BVW-C1 (`committee_role_id`), BVW-F1
  (`payroll_role_id`, profile and wage type live on the Payroll page), PROOF-B1 (`measure_confirmer_role_id`),
  PROOF-C1 (`emission_factor_kg_per_kwh`, unit costs)

| Card | Element | Rules | EN | DE |
|---|---|---|---|---|
| Answer promise | switch | default on for new companies | Hand the case to the deputy when the answer date passes · Off: the deputy is told, the owner keeps the case. | Fall an die Vertretung übergeben, wenn das Antwortdatum verstreicht · Aus: Die Vertretung wird informiert, der Fall bleibt beim Eigentümer. |
| Review | criteria editor (label EN/DE, weight, scale), days | 2-10 criteria, weights sum to 100, 1-30 working days | Assessment form · Criterion · Weight · Scale · Reviews are due after {n} working days | Bewertungsbogen · Kriterium · Gewichtung · Skala · Gutachten sind nach {n} Arbeitstagen fällig |
| Committee | role picker | an org role | Committee · The role whose seats decide on reviewed cases | Ausschuss · Die Rolle, deren Plätze über begutachtete Fälle entscheiden |
| Results | role picker | optional | Who confirms typed results · Besides managers and the lead's deputy | Wer eingegebene Ergebnisse bestätigt · Neben Führungskräften und der Vertretung der Projektleitung |
| Payroll | role picker | | Who exports premiums to payroll | Wer Prämien an die Lohnabrechnung exportiert |
| Measures | number + map | factor 0-2; costs ≥ 0 | Emission factor · kg CO₂e per kWh · Cost per unit · used to turn a result into euros | Emissionsfaktor · kg CO₂e pro kWh · Kosten pro Einheit · um ein Ergebnis in Euro umzurechnen |

**Done when:** [ ] the six cards, the form editor with a weight error, phone.

---

## Works-council pack

- **Route:** `/[company]/settings/works-council` (new; group "Data and security")
- **Who:** company admins; the oversight role sees the downloads.
- **Phase:** PACK-A1 (`worksCouncilPack`, download route), PACK-B1 (AI-Act sheet, per-case explanation), PROOF-D1
  (`outcome_consent`), PACK-L (the lawyer-checked annex: a link or upload slot *later*)
- **Data:** the pack's sections (titles only on the page), `generatedAt`, `configHash`, the consent state.

```
Works council and AI Act
What NextUp does at Acme Automotive, generated from its current settings.
┌ InfoPanel ───────────────────────────────────────────────────────────┐
│ Works-council pack     generated now from today's settings            │
│                        [ Download (Markdown) ] [ Print ]              │
│ AI-Act information     [ Download ]                                   │
│ Explanation of a case  on each case page, under ⋯                     │
└──────────────────────────────────────────────────────────────────────┘
┌ What the pack says ──────────────────────────────────────────────────┐
│ Data kept and for how long · Who sees what · AI · How the score is    │
│ computed · Premiums · Figures and the minimum group · No ranking of   │
│ people · What is logged                                               │
└──────────────────────────────────────────────────────────────────────┘
┌ Use of outcome data ─────────────────────────────────────────────────┐
│ [off] Anonymised benchmark across companies                          │
│ [off] Case study with measured results                               │
└──────────────────────────────────────────────────────────────────────┘
```

| Element | EN | DE |
|---|---|---|
| Lead | What NextUp does at {company}, generated from its current settings. | Was NextUp bei {company} tut, erzeugt aus den aktuellen Einstellungen. |
| Changed note | The settings changed since the last download on {date}. Download again for the works council. | Die Einstellungen haben sich seit dem letzten Download am {date} geändert. Für den Betriebsrat neu herunterladen. |
| Consent switches | Anonymised benchmark across companies · Case study with measured results | Anonymisierter Vergleich mit anderen Firmen · Fallstudie mit gemessenen Ergebnissen |
| Consent confirm | NextUp may use {company}'s anonymised figures for {use}. No text, name or id leaves this server. | NextUp darf die anonymisierten Kennzahlen von {company} für {use} verwenden. Kein Text, kein Name und keine Kennung verlässt diesen Server. |

**Done when:** [ ] page, consent on and off, changed note, phone; [ ] the "Explanation" entry in the case page's ⋯
menu.

---

## Oversight

- **Route:** `/[company]/oversight` (new; the home of the app role `oversight`)
- **Who:** members a company admin gave the `oversight` role (works council, DPO). They see no case, project or
  person page.
- **Phase:** PACK-C1
- **Content:** the ZI figures (as on `/kpis`), the answer-time ledger (MET: median time to first answer, share
  answered within the promise, per unit with `TooFewToShow`), the last 50 audit entries (spec 05's Audit log rows,
  read-only, with a link to the full log), and the pack downloads. Lead: "What the system does, without anyone's
  ideas." / "Was das System tut, ohne die Ideen einzelner."
- **States:** too small company; no audit entries yet. **Done when:** [ ] desktop and phone; the nav shows only this
  page.

---

## Benchmark

- **Route:** `/[company]/settings/benchmark` (new; group "Data and security") and a card on `/dashboard`
- **Who:** company admins (settings); managers (dashboard card).
- **Phase:** BENCH-A1, BENCH-B1 (`saveBenchClasses`, contribution download, `importBenchmark`, `benchmarkView`);
  consent from the Works-council pack page.
- **Settings page:** map each route to a decision class (Quality, Safety, Cost, Process, Maintenance, Logistics,
  People, Other) / (Qualität, Arbeitssicherheit, Kosten, Prozess, Instandhaltung, Logistik, Personal, Sonstiges);
  *Download contribution* (only with consent); *Import benchmark* (a JSON file from NextUp), with the period it
  covers.
- **Dashboard card:** per class: "Time to first answer: 3 days here, 5 days median across {n} companies" / "Zeit bis
  zur ersten Antwort: hier 3 Tage, Median über {n} Firmen 5 Tage"; on-time share and confirmed-better share the same
  way. A suppressed cell: "Too few companies to compare." / "Zu wenige Firmen für einen Vergleich."
- **Rules:** no company is ever named; under five companies nothing is shown.
- **States:** no consent ("Comparison is off. Turn it on under Works council and AI Act."); consent but no benchmark
  imported; imported; suppressed cells. **Done when:** [ ] settings in each state, the dashboard card, phone.

---

## Removed: contributor ranking and person pages

- **Phase:** TRUTH-A1 (ranking), TRUTH-B1 (person pages, `hiddenPeople`)
- **What goes:**
  - Progress: the "Most relied-on contributors" list and every per-person count in "Did anyone answer them" (spec 10
    "Progress").
  - `/[company]/people/[name]` and `/demo/people/[name]`: both pages are deleted; their URLs give the not-found page.
  - Every "View profile" button and every link on a person's name (raise page person card, idea parts, the team
    dashboard's person popover, search results of kind "Person"). The name stays as plain text.
- **What stays:** `/profile` (your own page).
- **Later:** MET may bring back a role-centric person page at `/people/[userId]` (spec 04 "Person page"), without
  counts, without a link on anonymous handles.
- **Done when:** [ ] the places that had a profile link are checked in the design: no dead button, the name reads as
  text.

---

## Data protection deltas to 05

No new page. Spec 05's pages get their data from these tasks, earlier than GDP's Bauplan would:

- Audit log: TRUTH-F1 (`AuditEvent`, `listAudit`) and TRUTH-F2 (admin sign-in, break-glass). New action rows for
  spec 05's table: Premium rule saved / Prämienregel gespeichert (`audit.settings.premium`), Payroll exported /
  Lohnexport erstellt (`audit.privacy.payroll`), Works-council pack downloaded / Betriebsratspaket heruntergeladen
  (`audit.privacy.pack`), Explanation downloaded / Erläuterung heruntergeladen (`audit.privacy.explanation`), Consent
  changed / Einwilligung geändert (`audit.privacy.consent`), Benchmark contribution downloaded / Benchmark-Beitrag
  heruntergeladen (`audit.privacy.bench.*`).
- Exports: CORE-X1 (`requestExport`, `downloadExport`, `DataExport`).
- Pseudonymise dialog: CORE-P1 (`pseudonymisePerson`; the name typed to confirm).

---

## Open questions added by this file

| # | Question | Default |
|---|---|---|
| 11-Q1 | Is `/reviews` in the main navigation or reached from the inbox? | A nav item that shows only while the viewer has a review request. |
| 11-Q2 | May managers see the whole committee page or only the decided list? | The whole page, read-only; only the committee role decides. |
| 11-Q3 | Does the premium letter go out by email as well? | No: authors open it from the project page; NTF only says "a premium was recorded". |
| 11-Q4 | Who may see the payroll page's "missing personnel number" names? | The payroll role and company admins only. |
| 11-Q5 | Is the ZI KPI report its own page or a tab on the Dashboard? | Its own page `/kpis`, linked from the Dashboard; MET may merge it later. |
| 11-Q6 | Does the oversight role also see the per-case explanation of decided cases? | Yes, without the raiser's name when they used a handle (PACK-B1). |
| 11-Q7 | Benchmark card on the Dashboard for every manager, or only on the settings page? | Dashboard card for managers, once a benchmark is imported. |
