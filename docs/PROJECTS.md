# Project pages

> **Updated 2026-11-16** · reference: how an idea's and a project's pages and tools work behind the `projectPages` flag
> (plan PAGES, built 13–16 Nov 2026: PGE, PGB, HUB, STP, PLN, REQ, FIL, plus the Jira look of #952). Paths are under
> `apps/app/src/`. Jira versions and attachments: docs/INTEGRATIONS.md, "Versions and attachments". Who may do what:
> docs/RIGHTS.md.

## The flag

`projectPages` (`config/flags.ts`, owner Kevin, remove by 2027-03-31): on by default for demo and sandbox companies,
off for pilot and live; admin.sellux.ch switches it per company (`FeatureFlag`, docs/DATA_MODEL.md). With the flag
off a project shows the older tab view (`TabView` in `components/projects/ProjectView.tsx`). The flag also gates the
sidebar's pages, shared forms (`server/forms.ts`) and Jira attachments (`server/actions/project-attachments.ts`).

## Pages and tools

A **page** is a named stack of **tools** (`features/projects/pages.ts`, types in `features/projects/types.ts`): a
`ProjectPage` has `id, title, icon, tools`; a `ToolInstance` has `id, kind, title, collapsed, content, rev`.
Limits: 24 pages, 24 tools a page, titles 1–60 characters, a removed page or tool can be restored for 30 days, an
event payload at most 12,000 characters. Idea, Overview and Agent appear at most once a project.

The tool kinds (`TOOL_REGISTRY`, `components/projects/tools/registry.tsx`; the add-tool menu groups them as Steps,
Write, Collect and Project):

| Kind | What it is | Code (`components/projects/`) |
|---|---|---|
| idea | the idea, as its own page shows it | `tools/IdeaTool` |
| overview | the project at a glance for a chosen range | `hub/overview` |
| board | Kanban: filters, person lanes, drag, inline add | `steps/board` |
| list | the steps as a table: filters, sort, cells edited in place | `steps/list` |
| calendar, timeline, milestones | the plan; milestones show their Jira version | `plan/*` |
| results | result cards with time per column | `hub/results` |
| files | the project's SharePoint folder, and its Jira attachments as read-only links | `files/` |
| doc, checklist, table, links | content saved with revisions | `hub/content` |
| requests | an inbox of requests and a form builder | `requests/inbox`, `requests/builder` |
| team, activity | who is on it, and what happened | `hub/team` |
| agent | the project agent, only for people who pass `maySeeAgentTab` | `agent/AgentTab` |

**What a new idea or project starts with** (#926): two pages, **Idea** (id `overview`; the idea tool; cannot be
removed or merged away) and **Files** (files and links). A Files page shows only the folder browser; its other tools
sit behind the gear (`features/files/settings.ts`).

**More pages.** "+ Add page" opens a two-step dialog: pick tools, then name the page
(`page/AddPageDialog.tsx`, `features/projects/page-wizard.ts`); ready-made pages are one click (Overview, Steps,
Plan, Results, Requests, Team, Activity, Agent; `READY_PAGES`). Pages are renamed, given an icon, reordered by
drag and merged by dropping one onto another; a merge and a removal each show one Undo. Pages a browser kept
locally before the log existed are copied into the log by `page/BrowserPagesImport.tsx`.

**On a page** each tool is a section (`page/ToolSection.tsx`): drag to reorder, ⋯ to move it to another page or
remove it, "+ Add tool here" between tools. The page head comes from the page's first tool (`tools/heads.ts`).
Overview, Results, Requests and Milestones carry the Jira pill when the project syncs (#921, #952; Results also has
"Open in Jira"). The project head (title, **Manage**, ⓘ, Start) shows only on the Idea page, and on Overview
until the project runs; Manage holds move done-by, pause, mark done and stop (#932, `head/ProjectMenu.tsx`).

## Navigation and addresses

The **sidebar** (`components/projects/ProjectsSidebar.tsx`, `features/projects/sidebar.ts`) is the only desktop
navigation (#861): ideas and projects, then the open one's pages, with a ⋯ menu each (rename, icon, merge, removed
pages). A draft that has not started lists `setup` first. A page's address is
`/[company]/projects/[projectId]?page=<pageId>` (`?page=setup` for a draft); an old `?tab=` is mapped by `tabToPage`
(`features/projects/page-route.ts`). A shared form is answered at `/[company]/forms/[formId]`.

## Events

No table: pages and tools are `project.*` events in the case log (`features/cases/events/project.ts`), reduced by
`features/projects/reduce.ts` (a project has no pages until its first page event, then `DEFAULT_PAGES`).

- Pages: `page.added`, `page.edited`, `page.moved`, `page.removed`, `page.restored`, `page.merged {mergeId,
  fromPageId, intoPageId}`, `page.unmerged`.
- Tools: `tool.added`, `tool.moved`, `tool.edited {title?, collapsed?, content?, baseRev?}`, `tool.removed`,
  `tool.restored`. Content is saved only when `baseRev` equals the tool's `rev` (else it is stale and refused); each
  save adds 1 to `rev`.
- Steps: `step.edited` gains `startDay` and `milestoneId`; a move to Blocked needs a `why` (≤ 400) and may carry
  `waitingOn {kind: person|outside|nobody}`; `step.checklist {op: add|edit|toggle|remove, itemId}` (≤ 30 items of
  200 characters); `step.commented {text, replyTo?}` (≤ 2000).
- Milestones (PLN-G1): `milestone.added`, `milestone.edited` with `{id, title ≤ 80, startDay?, dueDay, note ≤ 1000,
  shipped}`; removing one clears it from its steps. `external` and `sync` are the Jira sync's only.
- Forms and requests (REQ-G1): `form.saved` (each save raises the form's rev and keeps its revisions),
  `form.answered` (must carry the current `formRev`), `request.stepped`, `request.declined`, `request.reopened`.

Page, tool, form, checklist and step-comment events never wake the Jira sync (`NOT_SYNCED_PREFIXES`); step,
milestone and request events still do.

## Rights

`features/projects/permissions.ts`; the generated table is docs/RIGHTS.md. Pages, tools, steps, milestones, forms
and requests: the team (lead, members, a manager, and the decider while the draft waits), only while the project
is live. Step comments: the team or the sponsor. Answering a shared form: anyone signed in at the company. Seeing a
project does not let anyone edit it (#935): a viewer gets the page without edit controls, and the idea text is
revised by the raiser while the idea is open and by the lead after the yes.

## Files

The Files tool reads the project's SharePoint folder (the newest `project.linked` with system `sharepoint` and no
step, `features/files/link.ts`) as the person looking, with their own Microsoft token
(`server/actions/project-files.ts`, `server/files/graph-files.ts`; 5 s timeout, no caching, paths cannot leave the
folder). Uploading and removing need the right to link files (lead or manager) and a token that may write
(`Files.ReadWrite.All`, asked for since #911); otherwise the tool says read-only. Under the folder it lists the
project's Jira attachments as read-only links (docs/INTEGRATIONS.md).

## Demo and tests

The dev panel's "Add sample project" (`features/demo/sample-project.ts`) adds a project whose events stay in the
browser. Unit tests: `tests/unit/{pge,pgb,hub,stp,fil,req,pln}`; database: `tests/db/pge-pages`, `hub-content`,
`req-answer`, `req-requests`; end to end (demo): `tests/e2e/demo/{pages,hub,steps,files,plan,requests,projects}.spec.ts`.
Copy lives in `i18n/messages/` (`projectPages`, `projectHub`, `projectSteps`, `projectPlan`, `projectRequests`,
`projectFiles`).
