// Closed until opened, on the server: is the company open, may this person have a session, and the
// invitations that wait for "Open NextUp". Not a "use server" module: helpers the sign-in paths, the
// member actions and the setup pages call. The rules are in features/pilot/open.ts.
import { ROLE_HOME, type Role } from "@/config/roles";
import { inviteMail } from "@/features/auth/invite-mail";
import { generateLoginCode, hashLoginCode } from "@/features/auth/login-code";
import { signInEntry, type SetupPerson, type SignInEntry } from "@/features/pilot/open";
import { companyUrl } from "@/features/tenant/urls";
import { localeForEmail } from "@/i18n/server";
import { getDb } from "@/lib/db/client";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { sendMail, type MailResult } from "@/server/mail";

/** When the company was opened; null while it is closed. */
export async function loadOpenedAt(companyId: string): Promise<Date | null> {
  const row = await getDb().company.findUnique({ where: { id: companyId }, select: { openedAt: true } });
  return row?.openedAt ?? null;
}

/** What a sign-in of this person may do right now. Each path that issues a session asks this first. */
export async function entryFor(companyId: string, person: SetupPerson): Promise<SignInEntry> {
  return signInEntry(await loadOpenedAt(companyId), person);
}

/** Where a sign-in lands when it names no `next`: the setup process while closed, the role's home after. */
export function homeOf(entry: SignInEntry, role: string): string {
  return entry === "setup" ? "/setup" : ROLE_HOME[role as Role];
}

/** The one invitation mail: the person's login code and the company's login address. The code is in the body only. */
export async function mailInvitation(
  company: { id: string; slug: string; name: string },
  person: { name: string; email: string },
  code: string,
): Promise<MailResult> {
  const locale = await localeForEmail(company.id, person.email);
  const mail = inviteMail({ name: person.name }, { name: company.name, loginUrl: `${companyUrl(company.slug)}/login` }, code, locale);
  return sendMail({ to: person.email, subject: mail.subject, text: mail.text });
}

export type HeldResult = { sent: number; failed: number; waiting: number };

// A relay that refuses three in a row refuses the rest too, and each try makes a person wait for its timeout.
const STOP_AFTER_FAILURES = 3;

/**
 * Mails the invitations that waited for Open, each with a new code: nobody ever saw the first one. One
 * person at a time, and a person is claimed before their mail goes, so two runs never mail them twice. A mail
 * that fails puts them back in the queue. Sending again is safe.
 */
export async function sendHeldInvitations(companyId: string, byUserId: string): Promise<HeldResult> {
  const db = getDb();
  const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, slug: true, name: true, openedAt: true } });
  if (!company?.openedAt) return { sent: 0, failed: 0, waiting: 0 };
  const people = await db.user.findMany({
    where: { companyId, active: true, invitationHeldAt: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  let sent = 0;
  let failed = 0;
  let inARow = 0;
  for (const person of people) {
    if (inARow >= STOP_AFTER_FAILURES) break;
    const code = generateLoginCode(company.slug);
    const claimed = await db.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: person.id, companyId, invitationHeldAt: { not: null } },
        data: { invitationHeldAt: null, loginCodeHash: hashLoginCode(code), loginCodeAt: new Date() },
      });
      if (count !== 1) return false;
      await recordAudit(companyId, { actor: settingsActor({ userId: byUserId }), action: "audit.member.code", target: { kind: "user", id: person.id }, changes: {}, source: "settings" }, tx);
      return true;
    });
    if (!claimed) continue;
    const mail = await mailInvitation(company, person, code);
    if (mail.ok) {
      sent++;
      inARow = 0;
    } else {
      failed++;
      inARow++;
      await db.user.updateMany({ where: { id: person.id, companyId }, data: { invitationHeldAt: new Date() } });
    }
  }
  return { sent, failed, waiting: await countHeldInvitations(companyId) };
}

/** How many active people still wait for their invitation. */
export function countHeldInvitations(companyId: string): Promise<number> {
  return getDb().user.count({ where: { companyId, active: true, invitationHeldAt: { not: null } } });
}
