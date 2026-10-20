# Plan: one page that shows what NextUp knows about a company

> **Plan · 2026-10-21 · steps 1-2 built the same day, 3-6 not.** A "Data" page in each company's `/admin`. It lists every
> source NextUp reads, what each one holds, and what the AI may see. Follows the data-access
> research of 20 Oct 2026 (vault: "nextup – Recherche Datenzugang (Okt 2026)") and
> `docs/COMPANY_KNOWLEDGE.md` step 2.

## Why

The research found that customers give us data in phases: SSO and a role table first, then a
directory sync, then read-only connectors. At every phase their IT, data-protection officer and
works council ask the same question: *what exactly does NextUp hold about us, and what does the AI
read?* Today the answer is spread over four places, and the company itself can see none of them:

| What | Where today | Who sees it |
|---|---|---|
| Units, roles, routing, goals, the brief a model gets | `/admin/knowledge` (`KnowledgeView`) | platform admin only, read-only |
| Routing table | `[company]/settings/routing` | company, read-only, **from the seed, not the tables** |
| Documents and their TISAX class | `Document` table | nobody (no UI) |
| AI limits: ceiling, redaction, retention, DPA date | `CompanyConfig` via `/admin/assistant` | company admin |
| Company profile settings | `[company]/settings/company` | empty stub |

One page that answers "what do you hold, where from, and what may the AI read" is a sales asset
as much as an admin tool. It is the page we show in the security review.

## Where it lives

- **Company stack `/admin/company-data`** (scope `company`, `features/admin/nav.ts`): the customer's admins
  manage their data here. The company's data stays on its own stack (`docs/plans/2026-09-27_platform.md`).
- **Platform `/admin/company-data?company=<slug>`** (dev, demo): the same component with the company
  picker. It replaces `/admin/knowledge`, so developers keep their view and gain the inventory.
- **admin.sellux.ch** (`nextup-admin`): only *metadata* per stack (row counts, last sync, health),
  never content. It reads them from the stack's health endpoint the same way it reads its version.

The route folder is `company-data`, not `data`: `.gitignore` ignores every directory named `data/`.
The sidebar label stays "Data".

## The page

```
┌ Sources ──────────────────────────────────────────────────────────────┐
│ Login (SSO)   Org chart      Routing      Goals      Documents   Jira │
│ Entra · on    42 roles       15 rows      6 rows     118 docs    off  │
│ 312 users     manual         edited 3d    manual     3 above     ─    │
│               ↻ phase 2                              ceiling          │
└───────────────────────────────────────────────────────────────────────┘
┌ What the AI may read ─────────┐ ┌ Data map (for developers) ─────────┐
│ ceiling: internal             │ │ Entra ─▶ OrgRole ─┐                │
│ 4 redaction patterns          │ │ admin ─▶ Routing ─┼─▶ brief ─▶ AI  │
│ kept 90 days · DPA 2026-10-02 │ │ n8n   ─▶ Document ┘   (ceiling)    │
│ [show the exact brief]        │ └────────────────────────────────────┘
└───────────────────────────────┘
┌ Edit ── Profile · Units & roles · Routing · Goals · Documents ────────┐
```

**Built for scale (21 Oct, same PR).** Tables do not survive 500 people, so the org part of the page is
pictures with the tables behind a toggle: a treemap of units sized by people and coloured by how many
routing rows each owns (click a unit to narrow the tree), the role tree folded to the first level and capped
at 24 children per role and 300 roles, a grid with one square per routing row (green = owner, deputy and buddy
exist and are held), and goals as chips. The logic is in `features/admin/org-visual.ts` and is tested on a
made-up 500-person company (`tests/helpers/large-org.ts`). On a phone the treemap becomes ranked bars. No
holder's name is drawn anywhere on the page; the raw tables are capped at 50 rows.

Each source card shows four things: **status** (on / off / failing), **size** (rows, never names),
**origin** (`manual`, `seed`, `entra`, `n8n`, `upload`) and **freshness** (last edit or sync). One
click opens the rows, the same tables `KnowledgeView` renders now.

Rules from the research and `COMPANY_KNOWLEDGE.md`:
- **Roles, not people.** Cards count roles and holders; there is no per-person page or export.
- Documents are counted per TISAX class. The ones above the ceiling are shown as "stored, never
  searched" so the admin can relabel or delete them.
- The data map is drawn from a static list in code (like `nextup-admin`'s `roadmap.ts` feeds the
  system map), so it stays true when a new source is added.

## Steps

| # | What | Size | Needs |
|---|---|---|---|
| 1 | **Inventory, read-only.** `features/admin/data.ts`: one pure function `dataInventory(companyId)` that counts rows per source from the knowledge tables, `Document` (grouped by `source` and `classification`) and `CompanyConfig`. `/admin/company-data` renders the source strip and the AI card, plus `KnowledgeView` underneath. Platform `/admin/knowledge` redirects there. Unit test on the acme seed. | S | nothing new |
| 2 | **Data map.** `features/admin/data-map.ts` lists sources → tables → readers (router, brain, assistant, idea studio). A small SVG component draws it. Only the platform scope shows it by default. | S | step 1 |
| 3 | **Editors.** `COMPANY_KNOWLEDGE.md` step 2: profile, units & roles, routing, goals, edited as events. `settings/routing` reads the tables instead of the seed. Document upload with a required class label. | M | step 1 |
| 4 | **Source registry.** Comes with the first sync (Entra/SCIM, phase 2 of the research). New `DataSource` row per source (`kind`, `status`, `lastSyncAt`, `lastError`, `rowCount`) and a `SyncRun` log. Cards read it, so a failing sync shows up like Connections does today. | M | first connector |
| 5 | **Metadata on admin.sellux.ch.** The stack's health endpoint adds the inventory counts. `companies/[slug]` shows them. No content leaves the stack. | S | step 1, stack health |
| 6 | **Access requests** (later). A department's connector stays off until its manager approves it on this page. Each approval is an event. | M | step 4, a customer asking |

Steps 1 and 2 take a day and use only data we already store. Steps 3 to 6 follow the customer
phases from the research and should not be built before a customer reaches them.

## Decisions to take

1. Name: **"Data"**. Alternatives: "Knowledge" (current name, but it hides documents and limits)
   or "What NextUp knows".
2. Who can open it on a company stack: admins only (recommended), or also the works council as a
   read-only role. That would be a strong argument in the Betriebsvereinbarung.
3. Keep `/admin/knowledge` as a redirect (recommended) or remove it.
