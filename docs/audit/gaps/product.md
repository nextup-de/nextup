# Product and integration gaps

Plan AUD, task AUD-B1. Every row below is a gap between `main` (984f3b0, #249) and the PILOT pilot target, re-checked
in the code on 2026-11-01 against the audit in `docs/plans/2026-11-01_pilot-readiness.md`. Scope: case core, company
structure, identity and org, channels, integrations, AI, data protection inside the app, dashboards, tests, and what
is hard-wired to acme or the demo. Platform, operations, security controls and compliance documents are in
`platform.md` (G-200 to G-399).

Format and severity scale: `docs/audit/README.md`. Ids G-001 to G-199, never reused. Recording a gap fixes nothing;
the phase in the row does (D3).

| id | area | gap | evidence | severity | phase | owner |
| --- | --- | --- | --- | --- | --- | --- |
| G-001 | case core | Every deadline runs on Company.demoDay, which only a day.advanced event moves, and appendEventAction refuses day.advanced outside the demo stage: on a real company the 5-day promise, deputy hand-over, check-ins and the 30/90-day measures never fall due | apps/app/prisma/schema/core.prisma:53 · apps/app/src/server/actions/events.ts:84 · apps/app/src/lib/db/events.ts | high | CLK | K |
| G-002 | case core | Escalation to the deputy is computed at render time inside reduce() and never written as an event, and no scheduler job exists that could write it | apps/app/src/features/cases/reducer.ts:313 | high | CLK | K |
| G-003 | case core | The inbox matches people by display name: inboxFor and onDesk compare the assignee and escalated.to with a name string, so a user created by Entra just-in-time never matches a route owner from the seed | apps/app/src/features/cases/selectors.ts:10 | high | IDN | K |
| G-004 | case core | The actor of every event is a display name or a handle string chosen on the server, and permissions and the thread compare those strings, not user ids | apps/app/src/server/actions/events.ts:90 · apps/app/prisma/schema/core.prisma:116 · apps/app/src/features/cases/thread.ts | high | IDN | K |
| G-005 | case core | Route owners and deputies in the seed are names, and other tables must match a name used in seedJson | apps/app/src/features/demo/seed.ts:208 · apps/app/prisma/schema/auth.prisma:10 | high | IDN | K |
| G-006 | case core | Parts of the raise menu are placeholders: receivers, collaborators, meeting and visibility choices live only in page memory and a reload forgets them | apps/app/src/components/ideas/raisePreview.ts | medium | LOOP | S |
| G-007 | case core | The discussion and projects flags (with measure and reward) default to on for demo companies only; sandbox, pilot and live start off, only admin.sellux.ch can switch them, and the company itself cannot | apps/app/src/config/flags.ts:41 | medium | LOOP | S |
| G-008 | structure | Company.seedJson holds org, routes, goals and demo cases in one blob; structure and demo content cannot be changed or removed separately | apps/app/prisma/schema/core.prisma:61 · apps/app/src/features/demo/index.ts | high | STR | K |
| G-009 | structure | EMPTY_SEED spreads the acme SEED and clears only some lists: acme's routes, personas, leaders, ledger, metrics and view copy leak into every empty company | apps/app/src/features/demo/index.ts:10 · apps/app/src/features/demo/seed.ts:426 | high | STR | K |
| G-010 | structure | GOALS and SPEND_RULE are acme's goals and the "€5k" spend rule as code constants, used for every company by the raise page, the assistant, the idea coach and the dashboards | apps/app/src/features/evaluate/index.ts:30 · apps/app/src/app/api/[company]/assist/route.ts:84 · apps/app/src/components/ideas/Raise.tsx | high | STR | K |
| G-011 | structure | CompanyConfig.aiRouting, n8n and notifications are stored but never read by any code path | apps/app/prisma/schema/integrations.prisma:9 | medium | STR | K |
| G-012 | structure | The routing table is read-only from the seed; no company admin can change an owner, deputy or keyword | apps/app/src/app/[company]/(app)/settings/routing/page.tsx | high | ADM | S |
| G-013 | structure | The org (departments, people, leaders) is written once at company creation from a seed template; there is no org editor | apps/app/src/features/demo/index.ts:22 | medium | ADM | S |
| G-014 | structure | settings/company is an empty page: name, slug, logo and departments cannot be edited in the app | apps/app/src/app/[company]/(app)/settings/company/page.tsx | medium | ADM | S |
| G-015 | identity and org | A user created by Entra just-in-time gets name, email and role only: no department, no handle and no role holder | apps/app/src/server/microsoft-login.ts:295 | high | DIR | K |
| G-016 | identity and org | There is no directory sync (Graph delta or SCIM): people, groups, managers, deputies and leavers never reach NextUp after the first sign-in | apps/app/src/server/microsoft-login.ts · docs/plans/2026-10-22_sso-and-data-access.md | high | DIR | K |
| G-017 | identity and org | There is no delete-user or deactivate action at all; members can only be added, given a code or a new role | apps/app/src/server/actions/members.ts | high | DIR | K |
| G-018 | identity and org | Signup, accept-invite and password reset are stub pages that say "coming" | apps/app/src/app/(auth)/signup/page.tsx · apps/app/src/app/(auth)/invite/[token]/page.tsx · apps/app/src/app/(auth)/forgot-password/page.tsx | medium | ADM | S |
| G-019 | identity and org | One Entra tenant per company: Company.entraTenantId is a single value and the token's tid must equal it, so a group with several tenants cannot sign in | apps/app/prisma/schema/core.prisma:47 · apps/app/src/features/auth/entra.ts:229 | low | EID | K |
| G-020 | channels | No Microsoft Teams app: no notice, no raise and no answer from Teams; email is the only channel | apps/app/src/server/mail.ts | medium | TMS | V |
| G-021 | channels | No Slack or other chat adapter | apps/app/src/server/mail.ts | low | LATER | V |
| G-022 | channels | No QR codes per area and no shared-device (kiosk) mode with a short login for people without PC or mail | apps/app/src/features/auth/login-code.ts | medium | FLR | S |
| G-023 | channels | No installable web app: no manifest, no service worker | apps/app/src/app/layout.tsx | medium | FLR | S |
| G-024 | channels | No German UI: the root layout is lang="en", every string is inline English, no message catalog and no locale per user | apps/app/src/app/layout.tsx:27 | high | LNG | S |
| G-025 | channels | Mail is not gated by stage or opt-in: case and loop notices go out whenever SMTP_URL is set, and CompanyConfig.notifications is not read | apps/app/src/server/case-notice.ts · apps/app/src/server/loop-notice.ts · apps/app/src/server/mail.ts | medium | NTF | K |
| G-026 | channels | No digest and no reminders: every notice is a single mail at the moment of the event | apps/app/src/server/case-notice.ts | medium | NTF | K |
| G-027 | integrations | The events API is unversioned (/api/[company]/events, no /v1 and no contract) | apps/app/src/app/api/[company]/events/route.ts | medium | API | K |
| G-028 | integrations | The events API has no rate limit; the throttle used elsewhere is not applied to it | apps/app/src/app/api/[company]/events/route.ts · apps/app/src/server/throttle.ts | medium | API | K |
| G-029 | integrations | The events API returns every event of the company to any events:read token, with no filter by type, case or visibility | apps/app/src/app/api/[company]/events/route.ts:70 | medium | API | K |
| G-030 | integrations | No outbound webhooks and no outbox: the design is pull only | docs/INTEGRATIONS.md:39 | medium | NTF | K |
| G-031 | integrations | No OpenAPI and no customer API contract; packages/contracts holds only the stack-to-admin schemas | packages/contracts/src/index.ts | medium | API | K |
| G-032 | integrations | Jira sync supports Jira Cloud only; the Data Center adapter throws | apps/app/src/server/jira/dc.ts:7 · apps/app/src/server/jira-sync.ts | medium | CON | V |
| G-033 | integrations | Microsoft 365 search is off by default and its 21 ground-truth questions have not been run against a test tenant | apps/app/prisma/schema/integrations.prisma:44 · apps/app/src/features/m365/search.ts | medium | CON | V |
| G-034 | integrations | No shared connector interface: Jira has its own JiraApi seam, Microsoft 365 its own token and search code, and the next system would start from scratch | apps/app/src/server/jira/cloud.ts · apps/app/src/features/m365/search.ts · apps/app/src/features/connectors/vault.ts | medium | CON | V |
| G-035 | AI | The routing proposal is made in the browser and sent by the client inside the case.raised payload, so the server stores whatever proposal it is given | apps/app/src/components/ideas/Raise.tsx:405 · apps/app/src/features/cases/events.ts:75 | medium | AIP | V |
| G-036 | AI | The idea coach skips the DPA gate when the brain answers ("runs inside the stack, so no DPA gate") | apps/app/src/app/api/[company]/ideas/turn/route.ts:15 · apps/app/src/features/assist/gate.ts | medium | AIP | V |
| G-037 | AI | The eval set holds 32 ideas, 3 of them German; the pilot target is 80+ cases with a third in German | services/brain/eval/test_ideas.json | medium | AIP | V |
| G-038 | AI | The brain eval does not run in CI; nothing catches a routing or coach regression | services/brain/eval/run_eval.py · .github/workflows/ci.yml | medium | AIP | V |
| G-039 | data protection | Every browser gets the whole case log: the app layout loads all events and the seed for every signed-in user, and visibility is applied in the browser only | apps/app/src/app/[company]/(app)/layout.tsx:46 · apps/app/src/features/cases/visibility.ts:4 | high | VIS | K |
| G-040 | data protection | No read model and no paging: every append and every page reduces the full log of the company | apps/app/src/server/actions/events.ts:79 · apps/app/src/lib/db/events.ts:18 | medium | VIS | K |
| G-041 | data protection | Admin actions (admin sign-in, Jira settings, sync on or off, webhook secrets) are written only to console, not to an audit log | apps/app/src/server/actions/admin.ts:122 · apps/app/src/server/actions/jira-admin.ts:78 | high | GDP | K |
| G-042 | data protection | No data export per company or per person; the only export is the cross-company decisions CSV in /admin | apps/app/src/app/admin/decisions/export/route.ts | high | GDP | K |
| G-043 | data protection | No person deletion or pseudonymisation: a person's name stays in every event they wrote, and only a whole company can be deleted | apps/app/src/server/actions/admin.ts:305 · apps/app/src/server/actions/members.ts | high | GDP | K |
| G-044 | data protection | No retention for case events or kept drafts; only discarded drafts and assistant turns are purged | apps/app/src/lib/db/ideas.ts:84 · apps/app/src/lib/db/assist.ts:129 | medium | GDP | K |
| G-045 | data protection | Person rankings: "Most relied-on contributors" on the progress view and per-person counts on the person page | apps/app/src/features/metrics/index.ts:78 · apps/app/src/components/dashboard/shared/ProgressView.tsx:103 · apps/app/src/app/[company]/(app)/people/[userId]/page.tsx | high | GDP | K |
| G-046 | data protection | Handles are missing for JIT members and for members a manager adds, so their events carry the display name instead of an anonymous handle | apps/app/src/server/microsoft-login.ts:295 · apps/app/src/server/actions/members.ts:133 · apps/app/src/server/actions/events.ts:90 | high | IDN | K |
| G-047 | data protection | A company stack's /admin opens with one shared ADMIN_ACCESS_CODE, no named admins and no 2FA | apps/app/src/server/actions/admin.ts:6 · apps/app/src/features/admin/environment.ts:52 | high | ADM | K |
| G-048 | dashboards | The manager dashboard shows preview data from dashboardPreview, not the company's cases | apps/app/src/components/dashboard/shared/DashboardBoard.tsx | medium | MET | S |
| G-049 | dashboards | The feed runs on feedPreview placeholder data | apps/app/src/components/dashboard/team/FeedView.tsx | medium | MET | S |
| G-050 | dashboards | The overview runs on overviewPreview placeholder data and shows "—" without demo data | apps/app/src/features/metrics/overview.ts | medium | MET | S |
| G-051 | tests | The DB tests (apps/app/tests/db, run by ops/test-db.sh) are not run by any CI job | apps/app/tests/db · ops/test-db.sh · .github/workflows/ci.yml | medium | AUD | K |
| G-052 | tests | The brain's pytest suite is not run by any CI job | services/brain/tests · .github/workflows/ci.yml | medium | AUD | K |
| G-053 | hard-wired | The three roles and the Entra claim names (nextup.manager, nextup.leader, nextup.member, nextup.admin) are fixed in code, not configuration per company | apps/app/src/config/roles.ts:2 · apps/app/src/config/roles.ts:29 | medium | STR | K |
| G-054 | hard-wired | Our own team names (TEAM_NAMES: Kevin, Sam, Victor; OPENER_NAMES adds Marc) are a contract constant | packages/contracts/src/tickets.ts:53 | low | LATER | K |
| G-055 | hard-wired | In single mode the landing URL is derived from the sellux.ch host layout (acme.sellux.ch to sellux.ch) when LANDING_URL is unset | apps/app/src/features/tenant/urls.ts:72 | low | LATER | K |
