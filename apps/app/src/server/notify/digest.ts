// The daily digest runner (plan NTF, D12; INB, D6/D7/D18): on each working day of a company's calendar, from 07:00
// Europe/Berlin, every active person who switched the digest on and has something in their inbox gets the digest on
// the channels the company's rule for the digest group chose (Teams else mail, mail, or both; +mail:digest adds mail),
// and one in-app copy. This runner enqueues directly, so it applies the rule itself. Keys are digest:<user>:<workday>
// (the first outside channel), digest:<user>:<workday>:<channel> (the second) and digest:<user>:<workday>:app, so a
// second run the same day writes nothing new. Demo companies get none. A sandbox gets the in-app copy and skipped
// outside rows. Never throws: a company that fails is logged and the others go on. Not a "use server" module.
import { logFromRows } from "@/features/cases/persist";
import { relabelRows } from "@/lib/db/pseudonymise";
import { reduce } from "@/features/cases/reducer";
import { berlinDate, isWorkday, workdayOf } from "@/features/clock/calendar";
import { ROLES, type Role } from "@/config/roles";
import { flagsFor } from "@/features/flags";
import { ADD_MAIL_PREFIX, noticeChannelFor } from "@/features/notify/channels";
import { digestFor, DIGEST_TEMPLATE } from "@/features/notify/digest";
import { gateOf, prefOf } from "@/features/notify/gate";
import { TEAMS_SYSTEM, teamsApp } from "@/features/teams/config";
import { localeForUser } from "@/i18n/server";
import { loadCalendar } from "@/lib/db/calendar";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { prefsOf } from "@/lib/db/notify-prefs";
import { getIntegration } from "@/lib/db/integrations";
import type { OutboxDraft } from "@/lib/db/outbox";
import { teamsUserIds } from "@/lib/db/teams";
import { companyBaseUrl } from "@/server/case-notice";

/** A drafted row: the in-app copy is written as `sent`, now, and never delivered. */
type DigestRow = Omit<OutboxDraft, "status"> & { status: OutboxDraft["status"] | "sent"; sentAt?: Date };

/** The hour (Europe/Berlin) from which a working day's digest is written. */
export const DIGEST_HOUR = 7;

const berlinHour = (now: Date): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));

/** One pass over every non-demo company. Returns how many digest rows were written. */
export async function runDigests(now: Date = new Date()): Promise<number> {
  if (berlinHour(now) < DIGEST_HOUR) return 0;
  const db = getDb();
  const companies = await db.company.findMany({ where: { stage: { not: "demo" } }, select: { id: true, slug: true, stage: true, seedJson: true }, orderBy: { id: "asc" } });
  let written = 0;
  for (const company of companies) {
    try {
      const cal = await loadCalendar(company.id);
      if (!isWorkday(berlinDate(now), cal)) continue;
      const config = await db.companyConfig.findUnique({ where: { companyId: company.id }, select: { notifications: true, n8n: true, noticeChannels: true } });
      const gateCompany = { stage: company.stage, notifications: config?.notifications ?? false, n8n: config?.n8n ?? false };
      const users = await db.user.findMany({ where: { companyId: company.id, active: true }, select: { id: true, email: true, role: true } }); // no digest for a leaver (Q10.18)
      const prefs = await prefsOf(company.id, users.map((u) => u.id));
      // Opt-in and the company's switch decide whether a person gets a digest at all; a sandbox is judged per channel below.
      const wanting = users.filter((u) => gateOf({ ...gateCompany, stage: "pilot" }, "mail", DIGEST_TEMPLATE, prefOf(prefs, u.id, DIGEST_TEMPLATE)).send);
      if (wanting.length === 0) continue;

      // Teams works for the company (TMS D6): the app is set up, the switch is on, the tenant is known.
      const [integration, tenant] = teamsApp()
        ? await Promise.all([getIntegration(company.id, TEAMS_SYSTEM), db.company.findUnique({ where: { id: company.id }, select: { entraTenantId: true } })])
        : [null, null];
      const teamsOn = !!integration?.on && !!tenant?.entraTenantId;
      const teamsIds = teamsOn ? await teamsUserIds(company.id) : new Set<string>();
      const rule = noticeChannelFor(config, "digest");

      const seed = await companySeed(company);
      const rows = await db.caseEvent.findMany({
        where: { companyId: company.id },
        orderBy: { seq: "asc" },
        select: { id: true, seq: true, day: true, ts: true, type: true, actor: true, actorUserId: true, targetId: true, payload: true },
      });
      const log = logFromRows(await relabelRows(company.id, rows), workdayOf(now, cal));
      const state = reduce(seed, log);
      const baseUrl = companyBaseUrl(company.slug);
      const flags = await flagsFor(company.slug);
      const drafts: DigestRow[] = [];
      for (const u of wanting) {
        const role = ROLES.find((r): r is Role => r === u.role);
        const d = digestFor(u.id, state, seed.seats, await localeForUser(company.id, u.id), baseUrl, { flags: { projects: flags.projects, discussion: flags.discussion }, role, events: log.events });
        if (!d) continue;
        const email = u.email.trim() || null;
        const viaTeams = teamsOn && teamsIds.has(u.id);
        const addMail = prefs.some((r) => r.userId === u.id && r.template === `${ADD_MAIL_PREFIX}digest` && r.on);
        const channels: ("mail" | "teams")[] = rule === "mail" ? ["mail"] : rule === "both" ? (viaTeams ? ["mail", "teams"] : ["mail"]) : !viaTeams ? ["mail"] : addMail ? ["teams", "mail"] : ["teams"];
        const pref = prefOf(prefs, u.id, DIGEST_TEMPLATE);
        channels.forEach((channel, i) => {
          if (channel === "mail" && !email) return; // nothing to send to; the in-app copy still reaches the person
          const gate = gateOf(gateCompany, channel, DIGEST_TEMPLATE, pref);
          drafts.push({
            ...d, channel, key: i === 0 ? d.key : `${d.key}:${channel}`, address: channel === "mail" ? email : null,
            status: gate.send ? "pending" : "skipped", lastError: gate.send ? null : gate.reason,
          });
        });
        // The in-app copy never leaves: written as sent, now (INB/D5). One per person and day, whatever the channels.
        drafts.push({ ...d, channel: "inapp", key: `${d.key}:app`, address: null, status: "sent", sentAt: now });
      }
      // One whose (company, key) exists is left alone: a second run writes nothing.
      written += drafts.length ? (await db.outboxMessage.createMany({ data: drafts.map((d) => ({ ...d, companyId: company.id })), skipDuplicates: true })).count : 0;
    } catch (e) {
      console.warn(`[notify] digest ${company.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return written;
}
