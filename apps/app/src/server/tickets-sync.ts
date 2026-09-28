// Bug reports <-> admin.sellux.ch (nextup-ops), docs/PLATFORM_PLAN.md "Tickets".
//
// Outbound only: this stack sends its new tickets and fetches the replies meant for its reporters.
// admin.sellux.ch never calls in - which is what lets a stack sit behind a company firewall.
//
//   OPS_URL    https://admin.sellux.ch        unset = tickets stay in this stack only
//   OPS_TOKEN  this stack's token, issued in admin.sellux.ch -> Stacks
//
// Runs once a minute from instrumentation.ts, and right after someone files a report.
// Not a "use server" module.
import {
  IntakeAccepted,
  RepliesResponse,
  TICKETS_CONTRACT_VERSION,
  ticketLabel,
} from "@nextup/contracts";
import { replyMail, toIntake } from "@/features/tickets";
import { companyUrl } from "@/features/tenant/urls";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  lastReplyAt,
  markEmailed,
  markForwarded,
  saveReplies,
  ticketsToForward,
} from "@/lib/db/tickets";
import { mailConfigured, sendMail } from "@/server/mail";

type Ops = { url: string; token: string; secret: string };

function opsConfig(): Ops | null {
  const url = process.env.OPS_URL?.replace(/\/+$/, "");
  const token = process.env.OPS_TOKEN;
  const secret = process.env.AUTH_SECRET;
  if (!url || !token || !secret || !hasDatabase()) return null;
  return { url, token, secret };
}

export function ticketSyncConfigured(): boolean {
  return opsConfig() !== null;
}

async function call(ops: Ops, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(ops.url + path, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${ops.token}`, "content-type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

/** Send every ticket admin.sellux.ch does not have yet. A failure stays on the ticket and is retried. */
async function forward(ops: Ops, company: { id: string; slug: string }): Promise<void> {
  for (const t of await ticketsToForward(company.id)) {
    try {
      const res = await call(ops, "/api/intake", {
        method: "POST",
        body: JSON.stringify(toIntake(t, company.slug, ops.secret)),
      });
      if (!res.ok) throw new Error(`intake answered ${res.status}`);
      IntakeAccepted.parse(await res.json());
      await markForwarded(company.id, t.id, null);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      await markForwarded(company.id, t.id, why);
      console.warn(`[tickets] ${company.slug} ${ticketLabel(t.number)} not forwarded: ${why}`);
      return; // admin.sellux.ch is down or refusing; try the rest next round, in order
    }
  }
}

/** Fetch replies meant for this company's reporters, store them, and mail each reporter once. */
async function pullReplies(ops: Ops, company: { id: string; slug: string }): Promise<void> {
  const since = (await lastReplyAt(company.id)) ?? new Date(0);
  const res = await call(ops, `/api/replies?since=${encodeURIComponent(since.toISOString())}`);
  if (!res.ok) throw new Error(`replies answered ${res.status}`);
  const body = RepliesResponse.parse(await res.json());
  if (body.contractVersion !== TICKETS_CONTRACT_VERSION) return;

  const fresh = await saveReplies(company.id, body.replies);
  if (fresh.length === 0 || !mailConfigured()) return;
  const reportsUrl = `${companyUrl(company.slug)}/reports`;
  for (const r of fresh) {
    if (!r.reporterEmail) continue;
    const mail = replyMail(ticketLabel(r.ticketNumber), r.status, r.body, reportsUrl);
    const sent = await sendMail({ to: r.reporterEmail, ...mail });
    if (sent.ok) await markEmailed(company.id, r.replyId);
    else console.warn(`[tickets] reply mail for ${ticketLabel(r.ticketNumber)}: ${sent.error}`);
  }
}

let running: Promise<void> | null = null;

/** One round for every company in this deployment. Overlapping calls share the round in flight. */
export function syncTickets(): Promise<void> {
  const ops = opsConfig();
  if (!ops) return Promise.resolve();
  running ??= (async () => {
    try {
      const companies = await getDb().company.findMany({ select: { id: true, slug: true } });
      for (const c of companies) {
        await forward(ops, c);
        await pullReplies(ops, c).catch((e) =>
          console.warn(`[tickets] ${c.slug} replies: ${e instanceof Error ? e.message : String(e)}`),
        );
      }
    } catch (e) {
      console.warn(`[tickets] sync: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running = null;
    }
  })();
  return running;
}

const globalForSync = globalThis as unknown as { __nextupTicketSync?: ReturnType<typeof setInterval> };

/** Start the once-a-minute round. Idempotent (dev reloads this module). */
export function startTicketSync(): void {
  if (!opsConfig() || globalForSync.__nextupTicketSync) return;
  globalForSync.__nextupTicketSync = setInterval(() => void syncTickets(), 60_000);
  void syncTickets();
}
