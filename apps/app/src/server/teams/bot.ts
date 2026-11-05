// The Teams bot (TMS D14): one activity in, one answer out. The order is the contract:
//   1. is it the Bot Framework, for our bot? (D7: token, then serviceUrl)  -> 401, nothing touched
//   2. is it this company's Microsoft tenant?                               -> 403, nothing stored
//   3. is Teams on for the company?                                         -> 200 and a "not set up" card, nothing stored
//   4. who is it? remember their personal conversation, then dispatch by type.
import { attachment, notSetUpCard, textCard, type Card } from "@/features/teams/cards";
import { TEAMS_SYSTEM, teamsApp, type TeamsApp } from "@/features/teams/config";
import { createT, type Locale } from "@/i18n";
import { companyLocale, localeForUser } from "@/i18n/server";
import { getDb } from "@/lib/db/client";
import { getIntegration } from "@/lib/db/integrations";
import { companyBaseUrl } from "@/server/case-notice";
import { verifyBotRequest } from "./auth";
import { handleSubmit } from "./card-actions";
import { sendActivity } from "./connector";
import { handleExtension } from "./extension";
import { personOf, rememberConversation, tenantOf, type TeamsPerson } from "./identity";

/** What the route sends back: the HTTP status and, when there is one, the JSON body (an invoke response). */
export type BotResult = { status: number; body?: unknown };

export type BotPerson = TeamsPerson;
export type BotCompany = { id: string; slug: string; name: string; stage: string; entraTenantId: string | null };

/** The parts of an activity the bot reads. Everything is optional: it comes from the wire. */
export type BotActivity = {
  type?: string;
  id?: string;
  name?: string;
  serviceUrl?: string;
  from?: { id?: string; aadObjectId?: string };
  recipient?: { id?: string };
  conversation?: { id?: string; tenantId?: string; conversationType?: string };
  channelData?: { tenant?: { id?: string } };
  membersAdded?: { id?: string }[];
  value?: unknown;
  text?: string;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Tenant ids compare without case (D7). */
const sameTenant = (a: string, b: string) => a !== "" && a.toLowerCase() === b.toLowerCase();

/** Answer into the conversation the activity came from. A failed send is logged, never thrown: the work is done. */
async function replyTo(app: TeamsApp, activity: BotActivity, message: { text?: string; card?: Card }): Promise<void> {
  const serviceUrl = activity.serviceUrl;
  const conversationId = activity.conversation?.id;
  if (!serviceUrl || !conversationId) return;
  const body = {
    type: "message",
    ...(message.text !== undefined ? { text: message.text } : {}),
    ...(message.card ? { attachments: [attachment(message.card)] } : {}),
  };
  try {
    const res = await sendActivity(app, serviceUrl, conversationId, body);
    if (res.status >= 400) console.error("teams reply failed", res.status);
  } catch (err) {
    console.error("teams reply failed", err);
  }
}

const UNAUTHORIZED: BotResult = { status: 401, body: { error: "Unauthorized." } };

export async function handleActivity(slug: string, raw: unknown, authorization: string | null): Promise<BotResult> {
  const app = teamsApp();
  if (!app) return { status: 503, body: { error: "Teams is not configured on this stack." } };

  // The token check comes first, even for a body that is no activity: a stranger learns nothing.
  const auth = await verifyBotRequest(authorization, isRecord(raw) ? raw : null, app);
  if (!auth.ok) return UNAUTHORIZED;
  if (!isRecord(raw)) return { status: 400, body: { error: "Not an activity." } };
  const activity = raw as BotActivity;

  const company = await getDb().company.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, stage: true, entraTenantId: true, openedAt: true },
  });
  if (!company) return { status: 404, body: { error: "No such company." } };

  // No tenant bound: Teams cannot be on for this company (D6), whatever the switch says.
  if (company.entraTenantId && !sameTenant(tenantOf(activity), company.entraTenantId)) {
    return { status: 403, body: { error: "Wrong tenant." } };
  }
  const integration = company.entraTenantId ? await getIntegration(company.id, TEAMS_SYSTEM) : null;
  // Closed until opened: nobody raises from Teams yet, whatever the switch says.
  if (!company.entraTenantId || !integration?.on || !company.openedAt) {
    const locale = await companyLocale(company.id);
    await replyTo(app, activity, { card: notSetUpCard({ reason: "off", company: company.name }, locale) });
    return { status: 200 };
  }

  const fromId = activity.from?.aadObjectId;
  const person = fromId ? await personOf(company.id, fromId) : null;
  if (!person) {
    const locale = await companyLocale(company.id);
    if (activity.type === "invoke") {
      return { status: 200, body: { composeExtension: { type: "message", text: createT(locale)("teams.notLinked", { company: company.name }) } } };
    }
    if (activity.type === "message" || activity.type === "conversationUpdate") {
      await replyTo(app, activity, { card: notSetUpCard({ reason: "unknown", company: company.name }, locale) });
    }
    return { status: 200 };
  }

  await rememberConversation(company.id, person, activity);
  const locale = await localeForUser(company.id, person.id);

  if (activity.type === "conversationUpdate") return onConversationUpdate(app, activity, locale);
  if (activity.type === "message") return onMessage(app, company, person, activity, locale);
  if (activity.type === "invoke" && typeof activity.name === "string" && activity.name.startsWith("composeExtension/")) {
    return handleExtension(company, person, activity, locale);
  }
  return { status: 200 };
}

/** The bot was added to a chat: the conversation is saved already, say hello. */
async function onConversationUpdate(app: TeamsApp, activity: BotActivity, locale: Locale): Promise<BotResult> {
  const botId = activity.recipient?.id;
  const added = (activity.membersAdded ?? []).some((m) => m.id !== undefined && m.id === botId);
  if (added) await replyTo(app, activity, { text: createT(locale)("teams.welcome") });
  return { status: 200 };
}

async function onMessage(app: TeamsApp, company: BotCompany, person: BotPerson, activity: BotActivity, locale: Locale): Promise<BotResult> {
  if (activity.value !== undefined && activity.value !== null) {
    if (activity.conversation?.conversationType !== "personal") return { status: 200 };
    const card = await handleSubmit(company, person, activity, locale);
    if (card) await replyTo(app, activity, { card });
    return { status: 200 };
  }
  const text = createT(locale)("teams.howToRaise");
  await replyTo(app, activity, { card: textCard({ subject: "NextUp", text, link: companyBaseUrl(company.slug) }, locale) });
  return { status: 200 };
}
