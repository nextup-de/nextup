// The message extension (TMS D13): "Raise a case" from the Teams compose box or from a message.
//   composeExtension/fetchTask    -> a task module with the raise form (prefilled from the message)
//   composeExtension/submitAction -> the form becomes a CaseInput (teamsCaseSource.receive) and is raised as the
//     mapped person with the steps appendEventAction runs for case.raised: stampEvent, proposeOnRaise,
//     appendEventRow. Source 'teams', idemKey `teams:<activity id>`. One step; no separate proposal step (Q2).
import { createHash } from "node:crypto";
import type { CaseRef } from "@nextup/contracts/public";
import { DEFAULT_POST_AS, raiseLabel } from "@/features/ideas/posting";
import type { EventPayload } from "@/features/cases/events";
import { raiserDept, stampEvent } from "@/features/cases/stamp";
import { seedFor } from "@/features/demo";
import { attachment, raiseTask, RAISE_BODY_MAX, RAISE_TITLE_MAX } from "@/features/teams/cards";
import { createT, type Locale } from "@/i18n";
import { appendEventRow, hasIdemKey } from "@/lib/db/events";
import { loadUnitPeople } from "@/lib/db/pseudonymise";
import { companyBaseUrl } from "@/server/case-notice";
import { kickJira } from "@/server/jira-sync";
import { proposeOnRaise } from "@/server/routing";
import type { BotActivity, BotCompany, BotPerson, BotResult } from "./bot";
import { formData, messageText, teamsCaseSource } from "./case-source";

const message = (text: string): BotResult => ({ status: 200, body: { task: { type: "message", value: text } } });

/** The ids a Teams activity maps to: the same activity is always the same case. */
function idsFor(companyId: string, activityId: string): { eventId: string; caseId: string } {
  const hex = createHash("sha256").update(`${companyId}|${activityId}`).digest("hex").slice(0, 24);
  return { eventId: `e_teams_${hex}`, caseId: `c_teams_${hex}` };
}

const clip = (s: string, max: number) => Array.from(s).slice(0, max).join("");

function fetchTask(company: BotCompany, activity: BotActivity, locale: Locale): BotResult {
  const t = createT(locale);
  const fromMessage = (activity.value as { commandContext?: unknown } | undefined)?.commandContext === "message";
  const text = fromMessage ? messageText(activity.value) : "";
  const form = raiseTask(
    {
      company: company.name,
      kind: "problem",
      title: clip(text.split("\n")[0] ?? "", RAISE_TITLE_MAX),
      body: clip(text, RAISE_BODY_MAX),
      visibility: "everyone",
    },
    locale,
  );
  return { status: 200, body: { task: { type: "continue", value: { title: t("teams.raiseTitle"), width: "medium", height: "large", card: attachment(form) } } } };
}

async function submitAction(company: BotCompany, person: BotPerson, activity: BotActivity, locale: Locale): Promise<BotResult> {
  const t = createT(locale);
  const input = await teamsCaseSource.receive({ companyId: company.id, payload: activity, headers: {} });
  if (!input || !activity.id) return message(t("teams.errorNoTitle"));

  const idemKey = `teams:${activity.id}`;
  const { eventId, caseId } = idsFor(company.id, activity.id);
  const done = message(t("teams.raisedTask", { title: input.title }));
  // Teams repeats activities: a second one writes nothing and answers the same.
  if (await hasIdemKey(company.id, idemKey)) return done;

  const visibility = formData(activity.value).visibility === "private" ? "private" : "everyone";
  const seed = await seedFor(company.slug);
  // A card has no last look: the company's preselection decides (decision Q1.7).
  const poster = { role: person.role as "manager" | "leader" | "member", name: person.name, handle: person.handle };
  const actor = raiseLabel(poster, undefined, seed.postAs ?? DEFAULT_POST_AS);
  // The raiser's department, as the web raise names it (and hides it next to a handle in a small unit).
  const fromDept = raiserDept(person.dept, { label: actor, userId: person.id }, await loadUnitPeople(company.id));
  const base: EventPayload = { title: input.title, body: input.body, kind: input.kind, fromDept, visibility };
  const proposal = await proposeOnRaise(company.slug, company.id, base);
  const route = seed.routes.find((r) => r.id === proposal.routeId);
  const stamped = stampEvent("case.raised", { ...base, routeId: proposal.routeId, assignee: route?.owner.name ?? "" }, seed);

  const result = await appendEventRow(
    company.id,
    { id: eventId, day: 0, type: "case.raised", actor, targetId: caseId, payload: { ...stamped, proposal } },
    { actorUserId: person.id, source: "teams", idemKey },
  );
  if (!result.ok) return message(t("teams.refused", { reason: result.error }));
  if (result.duplicate) return done;

  kickJira(company.slug);
  const caseRef: CaseRef = {
    id: caseId,
    companyId: company.id,
    kind: input.kind,
    title: input.title,
    state: "open",
    ownerRoleId: route?.ownerRoleId ?? null,
    routeKey: proposal.routeId,
    raisedAt: input.receivedAt,
    url: `${companyBaseUrl(company.slug)}/cases/${caseId}`,
  };
  await teamsCaseSource.acknowledge?.({ externalId: input.externalId, caseRef });
  return done;
}

export async function handleExtension(company: BotCompany, person: BotPerson, activity: BotActivity, locale: Locale): Promise<BotResult> {
  if (activity.name === "composeExtension/fetchTask") return fetchTask(company, activity, locale);
  if (activity.name === "composeExtension/submitAction") return submitAction(company, person, activity, locale);
  return { status: 200 };
}
