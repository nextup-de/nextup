// Teams as a CaseSource (TMS D2, D13): a submitted raise form of the message extension becomes a CaseInput.
// source 'teams', externalId the activity id, raisedByExternalId 'entra:<aadObjectId>'. Pure but for acknowledge.
import { CaseInput, PUBLIC_CONTRACT_VERSION, type CaseSource } from "@nextup/contracts/public";
import { attachment, confirmCard, RAISE_BODY_MAX, RAISE_TITLE_MAX } from "@/features/teams/cards";
import { teamsApp } from "@/features/teams/config";
import { seedFor } from "@/features/demo";
import { localeForUser } from "@/i18n/server";
import { getDb } from "@/lib/db/client";
import { conversationOf } from "@/lib/db/teams";
import { companyBaseUrl } from "@/server/case-notice";
import { sendActivity } from "./connector";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The message text Teams hands over is HTML; keep the words. */
export function plainText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The text of the message the extension was opened on (context 'message'), or "". */
export function messageText(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.messagePayload) || !isRecord(value.messagePayload.body)) return "";
  const body = value.messagePayload.body;
  const content = str(body.content);
  return body.contentType === "html" ? plainText(content) : content.trim();
}

/** The form data of a submitAction. */
export function formData(value: unknown): Record<string, unknown> {
  return isRecord(value) && isRecord(value.data) ? value.data : {};
}

export const teamsCaseSource: CaseSource = {
  info: { kind: "CaseSource", id: "teams", contractVersion: PUBLIC_CONTRACT_VERSION },

  async receive({ companyId, payload }) {
    if (!isRecord(payload) || payload.type !== "invoke" || payload.name !== "composeExtension/submitAction") return null;
    const id = str(payload.id);
    const aad = isRecord(payload.from) ? str(payload.from.aadObjectId) : "";
    if (!id || !aad) return null;
    const data = formData(payload.value);
    const title = str(data.title).trim();
    if (!title) return null;
    const parsed = CaseInput.safeParse({
      companyId,
      source: "teams",
      externalId: id,
      kind: data.kind === "idea" ? "idea" : "problem",
      title: Array.from(title).slice(0, RAISE_TITLE_MAX).join(""),
      body: Array.from(str(data.body).trim()).slice(0, RAISE_BODY_MAX).join(""),
      raisedByUserId: null,
      raisedByExternalId: `entra:${aad}`,
      routeHint: null,
      receivedAt: new Date().toISOString(),
    });
    return parsed.success ? parsed.data : null;
  },

  /** Send the confirmCard of a raise to the person's 1:1 chat, when they have one. Never throws. */
  async acknowledge({ externalId, caseRef }) {
    try {
      const app = teamsApp();
      if (!app) return;
      const row = await getDb().caseEvent.findFirst({
        where: { companyId: caseRef.companyId, idemKey: `teams:${externalId}`, type: "case.raised" },
        select: { actorUserId: true, payload: true },
      });
      if (!row?.actorUserId) return;
      const conversation = await conversationOf(caseRef.companyId, row.actorUserId);
      if (!conversation) return;
      const company = await getDb().company.findUnique({ where: { id: caseRef.companyId }, select: { slug: true, name: true, stage: true } });
      if (!company) return;
      const payload = isRecord(row.payload) ? row.payload : {};
      const seed = await seedFor(company.slug);
      const route = seed.routes.find((r) => r.id === payload.routeId);
      const locale = await localeForUser(caseRef.companyId, row.actorUserId);
      const card = confirmCard(
        {
          outcome: "raised",
          title: caseRef.title,
          role: route?.owner.role ?? "",
          visibility: payload.visibility === "private" ? "private" : "everyone",
          company: company.name,
          link: `${companyBaseUrl(company.slug)}/cases/${caseRef.id}`,
          sandbox: company.stage === "sandbox",
        },
        locale,
      );
      const res = await sendActivity(app, conversation.serviceUrl, conversation.conversationId, { type: "message", attachments: [attachment(card)] });
      if (res.status >= 400) console.error("teams confirmation failed", res.status);
    } catch (err) {
      console.error("teams confirmation failed", err);
    }
  },
};
