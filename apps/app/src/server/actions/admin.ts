"use server";
// The admin surface: create a company, hand out its people's login codes, delete it.
//
// Deliberately OUTSIDE the [company] segment and outside the role system. src/config/roles.ts has
// three roles and they are all per-company; a fourth "superadmin" role would change the meaning of
// every ROLE_ACCESS row. Instead /admin sits behind its own cookie, unlocked by ADMIN_ACCESS_CODE.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, timingSafeEqual } from "node:crypto";
import { isTenantId } from "@/features/auth/entra";
import { generateLoginCode, hashLoginCode } from "@/features/auth/login-code";
import { ADMIN_COOKIE, signAdmin, verifyAdmin } from "@/features/auth/cookie";
import type { CompanyRow, PilotRequestRow } from "@/features/admin/rows";
import { seedTemplate } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { GOALS } from "@/features/evaluate";
import { hasKnowledge, rowsFromSeed } from "@/features/knowledge";
import {
  initialsOf,
  markFor,
  seedNameWarnings,
  validateNewCompany,
  type NewCompany,
  type NewPerson,
} from "@/features/tenant/create";
import { databaseOutage, getDb, hasDatabase, orDemo, reconnectDatabase } from "@/lib/db/client";
import { automationFor, raiseCountFor, raisesFor } from "@/lib/db/automation";
import { databaseFacts, type DatabaseFacts } from "@/lib/db/health";
import { describeDatabase, type DatabaseReport } from "@/features/admin/health";
import { canMoveStage, isStage, STAGES } from "@/features/admin/stages";
import { replaceKnowledge } from "@/lib/db/knowledge";
import { createToken } from "@/lib/db/tokens";
import { summarise, type AutomationReport, type NoticeFacts } from "@/features/integrations/automation";
import { classify, type AutomationTaskView } from "@/features/integrations/tasks";
import { buildRaisedNotice } from "@/features/cases/notice";
import { companyBaseUrl, deliverRaisedNotice } from "@/server/case-notice";
import { companySeed } from "@/lib/db/companies";
import type { EventPayload } from "@/features/cases/events";
import { companyUrl, dashboardUrl, landingUrl } from "@/features/tenant/urls";
import { DEMO_COMPANIES } from "@/features/tenant/demo-companies";
import { readEdit, readReply, validateEdit, validateReply, type Reply, type ReplyVia } from "@/features/admin/requests";
import { sendMail, type MailStatus } from "@/server/mail";
import { secureCookies } from "@/server/issue-session";
import { clientKey, forgive, throttle } from "@/server/throttle";
import type { Role } from "@/config/roles";

// The row shapes live in features/admin/rows.ts, next to the demo rows that mirror them.
export type { CompanyRow, PilotRequestRow };

const ADMIN_TTL_SECONDS = 8 * 60 * 60;

/** Compared as digests, so neither the code's content nor its length leaks through timing. */
function codeMatches(given: string, expected: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v.normalize("NFKC")).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

// The admin cookie is stateless (signed, 8 h), so deleting it only logs out THIS browser. Logging
// out also moves this watermark: every admin cookie issued before it stops working here, in this
// process - a copied cookie included. In memory on purpose (one box, one process); a restart
// clears it, which the 8 h expiry still bounds.
const adminRevocation = globalThis as unknown as { __nextupAdminRevokedAt?: number };

/** When the cookie was issued, read back from its (already verified) expiry. */
function issuedAt(raw: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(raw.slice(0, raw.indexOf(".")), "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp - ADMIN_TTL_SECONDS : null;
  } catch {
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw || !verifyAdmin(raw, secret)) return false;
  const revokedAt = adminRevocation.__nextupAdminRevokedAt;
  const iat = issuedAt(raw);
  return revokedAt === undefined || (iat !== null && iat >= revokedAt);
}

export type AdminLoginState = { error?: string };

export async function adminSignIn(_prev: AdminLoginState, form: FormData): Promise<AdminLoginState> {
  const expected = process.env.ADMIN_ACCESS_CODE;
  const secret = process.env.AUTH_SECRET;
  if (!expected || !secret) return { error: "ADMIN_ACCESS_CODE and AUTH_SECRET must be set on the server." };

  // The code opens everything, so this is the tightest door: 5 tries per address per 15 min.
  const who = await clientKey();
  const blocked = throttle("adminLogin", who);
  if (blocked) return { error: blocked };

  const given = String(form.get("code") ?? "");
  if (!given || !codeMatches(given, expected)) {
    console.warn(`[admin] wrong admin code from ${who}`);
    return { error: "That is not the admin code." };
  }
  forgive("adminLogin", who);

  // strict: the admin area is never entered from a link on another site, so the cookie never
  // needs to travel on one - which also takes cross-site request forgery off the table.
  (await cookies()).set(ADMIN_COOKIE, signAdmin(Math.floor(Date.now() / 1000) + ADMIN_TTL_SECONDS, secret), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: secureCookies(),
    maxAge: ADMIN_TTL_SECONDS,
  });
  // In subdomain mode the admin surface is the host root, so adminHome() is "" - and redirect("")
  // is a TypeError: Invalid URL, not a redirect to the root.
  redirect(adminHome() || "/");
}

/**
 * Logs out this browser, and every other admin cookie issued up to now (see adminRevocation).
 * Leaving the admin area through the header's "Landing page" / "Dashboard" also logs out: `to`
 * names where to go next. A fixed key, never a URL, so this cannot become an open redirect.
 */
export async function adminSignOut(form?: FormData) {
  adminRevocation.__nextupAdminRevokedAt = Math.floor(Date.now() / 1000);
  (await cookies()).delete(ADMIN_COOKIE);
  const to = form?.get("to");
  if (to === "landing") redirect(landingUrl());
  if (to === "dashboard") redirect(dashboardUrl(DEMO_COMPANIES[0].slug));
  redirect(adminHome() + "/login");
}

export async function listCompanies(): Promise<CompanyRow[]> {
  if (!(await isAdmin()) || !hasDatabase()) return [];
  const rows = await getDb().company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, slug: true, name: true, stage: true, createdAt: true, entraTenantId: true,
      users: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, role: true, loginCodeAt: true, entraOid: true },
      },
      _count: { select: { users: true, events: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    stage: r.stage,
    people: r._count.users,
    events: r._count.events,
    url: companyUrl(r.slug),
    createdAt: r.createdAt.toISOString(),
    entraTenantId: r.entraTenantId,
    // Same as microsoftCallbackUrl() builds from the request, spelled from the public address.
    microsoftCallback: `${companyUrl(r.slug)}/login/microsoft/callback`,
    persons: r.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      codeIssuedAt: u.loginCodeAt?.toISOString() ?? null,
      microsoft: Boolean(u.entraOid),
    })),
  }));
}

export type CreateState =
  | { status: "idle" }
  | { status: "error"; problems: string[] }
  /** Every person's login code, shown once, here, and never again - only hashes are stored. */
  | { status: "created"; slug: string; url: string; codes: IssuedCode[]; warnings: string[] };

export type IssuedCode = { name: string; email: string; code: string };

export async function createCompanyAction(_prev: CreateState, form: FormData): Promise<CreateState> {
  if (!(await isAdmin())) return { status: "error", problems: ["Not signed in to the admin area."] };
  if (!hasDatabase()) return { status: "error", problems: ["No database is configured."] };

  const input: NewCompany = {
    slug: String(form.get("slug") ?? "").trim(),
    name: String(form.get("name") ?? "").trim(),
    mark: String(form.get("mark") ?? "").trim() || undefined,
    template: form.get("template") === "empty" ? "empty" : "demo",
    people: parsePeople(form),
  };
  // Demo (made-up people, demo tools on) or sandbox (real people, locked down). Anything else -
  // a stale form, a hand-made POST - is a demo, never silently a later stage.
  const stage = form.get("stage") === "sandbox" ? "sandbox" : "demo";

  const problems = validateNewCompany(input);
  if (problems.length) return { status: "error", problems: problems.map((p) => p.message) };

  const db = getDb();
  if (await db.company.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
    return { status: "error", problems: [`A company with the slug "${input.slug}" already exists.`] };
  }

  const seed = seedTemplate(input.template);
  const now = new Date();
  const codes = input.people.map((p) => ({ name: p.name.trim(), email: p.email.trim().toLowerCase(), code: generateLoginCode(input.slug) }));

  const company = await db.company.create({
    data: {
      slug: input.slug,
      name: input.name,
      mark: markFor(input),
      stage,
      seedJson: toSeedJson(seed) as object,
      config: { create: {} },
      users: {
        create: input.people.map((p, i) => ({
          name: p.name.trim(),
          email: p.email.trim().toLowerCase(),
          role: p.role,
          dept: p.dept ?? "",
          ini: initialsOf(p.name),
          handle: p.handle ?? null,
          loginCodeHash: hashLoginCode(codes[i].code),
          loginCodeAt: now,
        })),
      },
    },
  });

  // The template's org units, roles, routing table and goals as rows (docs/COMPANY_KNOWLEDGE.md).
  // The empty template has none, and a company without rows reads from seedJson as before.
  const knowledge = rowsFromSeed(seed, input.template === "demo" ? GOALS : [], () => crypto.randomUUID());
  if (hasKnowledge(knowledge)) await replaceKnowledge(company.id, knowledge, "admin");

  return {
    status: "created",
    slug: input.slug,
    url: companyUrl(input.slug),
    codes,
    warnings: seedNameWarnings(seed, input.people),
  };
}

export type RotateState = { slug?: string; error?: string };

export type LoginCodeState = { slug?: string; name?: string; code?: string; error?: string };

/**
 * A new personal login code for one person. The previous one stops working at once - this is
 * also how a lost or leaked code is revoked. Shown once; only its hash is stored.
 */
export async function issueLoginCodeAction(_prev: LoginCodeState, form: FormData): Promise<LoginCodeState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };

  const slug = String(form.get("slug") ?? "");
  const userId = String(form.get("userId") ?? "");
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  const user = company
    ? await getDb().user.findFirst({ where: { id: userId, companyId: company.id }, select: { id: true, name: true } })
    : null;
  if (!company || !user) return { error: "No such person in this company." };

  const code = generateLoginCode(slug);
  await getDb().user.update({
    where: { id: user.id, companyId: company.id },
    data: { loginCodeHash: hashLoginCode(code), loginCodeAt: new Date() },
  });
  revalidatePath("/admin", "layout");
  return { slug, name: user.name, code };
}

export type TenantState = { slug?: string; saved?: boolean; error?: string };

/** Turns "Continue with Microsoft" on for a company (its Entra tenant ID), or off (empty). */
export async function setEntraTenantAction(_prev: TenantState, form: FormData): Promise<TenantState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };

  const slug = String(form.get("slug") ?? "");
  const raw = String(form.get("tenantId") ?? "").trim().toLowerCase();
  if (raw && !isTenantId(raw)) {
    return { slug, error: "That isn't an Entra tenant ID. It looks like 72f988bf-86f1-41af-91ab-2d7cd011db47 (Entra admin center → Overview)." };
  }
  const { count } = await getDb().company.updateMany({ where: { slug }, data: { entraTenantId: raw || null } });
  if (count === 0) return { slug, error: "No such company." };
  revalidatePath("/admin", "layout");
  return { slug, saved: true };
}

/** Destructive and irreversible: the cascade takes the people and the whole event log with it. */
export async function deleteCompanyAction(_prev: RotateState, form: FormData): Promise<RotateState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };

  const slug = String(form.get("slug") ?? "");
  // Typing the slug is the confirmation - there is no undo.
  if (String(form.get("confirm") ?? "") !== slug) {
    return { error: `Type "${slug}" to confirm. Deleting takes its people and its whole history with it.` };
  }
  await getDb().company.deleteMany({ where: { slug } });
  return { slug };
}

export type TokenState = { slug?: string; token?: string; error?: string };

/** An API token for this company's integration endpoints. Shown once; only its hash is stored. */
export async function createApiTokenAction(_prev: TokenState, form: FormData): Promise<TokenState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };

  const slug = String(form.get("slug") ?? "");
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return { error: "No such company." };

  const token = await createToken(company.id, "n8n", ["events:read", "events:write", "knowledge:write"]);
  return { slug, token };
}

function parsePeople(form: FormData): NewPerson[] {
  const names = form.getAll("personName").map(String);
  const emails = form.getAll("personEmail").map(String);
  const roles = form.getAll("personRole").map(String);
  const depts = form.getAll("personDept").map(String);

  return names
    .map((name, i) => ({
      name: name.trim(),
      email: (emails[i] ?? "").trim(),
      role: (roles[i] ?? "member") as Role,
      dept: (depts[i] ?? "").trim() || undefined,
    }))
    .filter((p) => p.name || p.email);
}

function adminHome(): string {
  return process.env.TENANT_MODE === "subdomain" ? "" : "/admin";
}

// ---- Pilot requests from /contact ---------------------------------------------------------------

/** Newest first, open ones before handled ones, each with its reply thread. */
export async function listPilotRequests(): Promise<PilotRequestRow[]> {
  if (!(await isAdmin()) || !hasDatabase()) return [];
  const rows = await getDb().pilotRequest.findMany({
    orderBy: [{ handledAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 200,
    include: { replies: { orderBy: { sentAt: "asc" } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    email: r.email,
    decision: r.decision,
    council: r.council,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    handledAt: r.handledAt?.toISOString() ?? null,
    notes: r.notes,
    replies: r.replies.map((x) => ({
      id: x.id,
      to: x.to,
      subject: x.subject,
      body: x.body,
      via: x.via,
      sentAt: x.sentAt.toISOString(),
    })),
  }));
}

export type HandledState = { error?: string };

/** Replied / reopened. Toggles, so a slip can be undone. */
export async function markPilotRequestHandled(_prev: HandledState, form: FormData): Promise<HandledState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };

  const id = String(form.get("id") ?? "");
  const handled = String(form.get("handled") ?? "") === "1";
  await getDb().pilotRequest.updateMany({ where: { id }, data: { handledAt: handled ? new Date() : null } });
  revalidatePath("/admin", "layout");
  return {};
}

export type EditRequestState = { saved?: number; problems?: string[] };

/** Correct what the form captured, and keep internal notes next to it. */
export async function updatePilotRequestAction(_prev: EditRequestState, form: FormData): Promise<EditRequestState> {
  if (!(await isAdmin())) return { problems: ["Not signed in to the admin area."] };
  if (!hasDatabase()) return { problems: ["No database is configured."] };

  const id = String(form.get("id") ?? "");
  const edit = readEdit(form);
  const problems = validateEdit(edit);
  if (problems.length) return { problems };

  const { count } = await getDb().pilotRequest.updateMany({ where: { id }, data: edit });
  if (count === 0) return { problems: ["That request is gone - someone deleted it."] };
  revalidatePath("/admin", "layout");
  return { saved: Date.now() };
}

export type ReplyState = {
  sent?: number;
  via?: ReplyVia;
  problems?: string[];
  /** Handed back on failure, so a mail server saying no does not cost the admin the draft. */
  draft?: Reply;
};

/**
 * Answer a request. intent=send mails it through SMTP_URL; intent=log records a reply written in
 * the admin's own mail app. Either way it lands in the thread and the request counts as replied.
 */
export async function replyPilotRequestAction(_prev: ReplyState, form: FormData): Promise<ReplyState> {
  if (!(await isAdmin())) return { problems: ["Not signed in to the admin area."] };
  if (!hasDatabase()) return { problems: ["No database is configured."] };

  const id = String(form.get("id") ?? "");
  const via: ReplyVia = form.get("intent") === "log" ? "manual" : "smtp";
  const reply = readReply(form);
  const problems = validateReply(reply);
  if (problems.length) return { problems, draft: reply };

  const request = await getDb().pilotRequest.findUnique({ where: { id }, select: { email: true } });
  if (!request) return { problems: ["That request is gone - someone deleted it."], draft: reply };

  if (via === "smtp") {
    const result = await sendMail({ to: request.email, subject: reply.subject, text: reply.body });
    if (!result.ok) return { problems: [result.error], draft: reply };
  }

  const now = new Date();
  await getDb().$transaction([
    getDb().pilotReply.create({ data: { requestId: id, to: request.email, ...reply, via, sentAt: now } }),
    getDb().pilotRequest.update({ where: { id }, data: { handledAt: now } }),
  ]);
  revalidatePath("/admin", "layout");
  return { sent: now.getTime(), via };
}

export type DeleteRequestState = { deleted?: boolean; error?: string };

/** Gone for good, replies included. The panel asks twice; the second ask sets confirm=yes. */
export async function deletePilotRequestAction(_prev: DeleteRequestState, form: FormData): Promise<DeleteRequestState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };
  if (form.get("confirm") !== "yes") return { error: "Confirm the delete first." };

  const id = String(form.get("id") ?? "");
  await getDb().pilotRequest.deleteMany({ where: { id } });
  revalidatePath("/admin", "layout");
  redirect(adminHome() + "/requests");
}

// ── Case notices ─────────────────────────────────────────────────────────────
// When a case is raised the app emails the route owner and notes it on the case
// (server/case-notice.ts). "Is it working?" is assembled from the relay check the Mail card already
// made and from the notes that exist. The wording lives in features/integrations/automation.ts
// and is unit-tested.

/** Takes the relay status rather than checking it again - adminContext already asked once. */
export async function automationReport(mail: Pick<MailStatus, "configured" | "reachable" | "target">): Promise<AutomationReport | null> {
  if (!(await isAdmin()) || !hasDatabase()) return null;

  const companies = await getDb().company.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, name: true },
  });
  const [rows, raises] = await Promise.all([
    automationFor(companies),
    raiseCountFor(companies.map((c) => c.id)),
  ]);

  const facts: NoticeFacts = { configured: mail.configured, reachable: mail.reachable, target: mail.target };
  return { facts, companies: rows, summary: summarise(facts, rows, raises) };
}

/**
 * One timestamp, rendered on the server in a zone that does not depend on where it runs. The
 * container is UTC and a browser is not, so letting a client component format this is a
 * hydration mismatch - see AutomationTaskView.
 */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: process.env.TZ || "Europe/Zurich",
  });
}

/**
 * Every raise and whether its owner was told, newest first.
 *
 * The owner is resolved with buildRaisedNotice - the same function the real notice uses - so this
 * page cannot disagree with what was actually sent about who owns a route.
 */
export async function automationTasks(limit = 25): Promise<AutomationTaskView[]> {
  if (!(await isAdmin()) || !hasDatabase()) return [];

  const companies = await getDb().company.findMany({
    select: { id: true, slug: true, name: true, demoDay: true, seedJson: true, users: { select: { name: true, email: true } } },
  });
  if (companies.length === 0) return [];

  const byId = new Map(companies.map((c) => [c.id, c]));
  const seeds = new Map(await Promise.all(companies.map(async (c) => [c.id, await companySeed(c)] as const)));
  const raises = await raisesFor(companies.map((c) => c.id), limit);
  const now = Date.now();

  return raises.map((r) => {
    const company = byId.get(r.companyId);
    const payload = (r.payload ?? {}) as EventPayload;
    const notice = company
      ? buildRaisedNotice({
          slug: company.slug,
          eventId: r.eventId,
          caseId: r.caseId ?? "",
          payload,
          seed: seeds.get(company.id)!,
          people: company.users,
          day: company.demoDay,
          baseUrl: companyBaseUrl(company.slug),
        })
      : null;

    const task = classify(
      {
        eventId: r.eventId,
        slug: company?.slug ?? "",
        companyName: company?.name ?? "",
        caseId: r.caseId ?? "",
        title: payload.title ?? "Untitled",
        ownerName: notice?.route.ownerName ?? null,
        ownerEmail: notice?.route.ownerEmail ?? null,
        raisedAt: r.raisedAt,
        noticeAt: r.noticeAt,
      },
      now,
    );
    return { ...task, raisedLabel: stamp(r.raisedAt) };
  });
}

export type RetryState = { eventId?: string; ok?: boolean; error?: string };

/**
 * Email one raise's owner again, and say what came back.
 *
 * Safe to press twice: a notice already on the case (idempotency key notify:<eventId>) is found
 * first, so the owner is not mailed a second time. Unlike the raise path this awaits the answer -
 * the whole point is to see the failure.
 */
export async function retryNoticeAction(_prev: RetryState, form: FormData): Promise<RetryState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };

  const eventId = String(form.get("eventId") ?? "");
  const slug = String(form.get("slug") ?? "");

  const company = await getDb().company.findUnique({
    where: { slug },
    select: { id: true, demoDay: true, seedJson: true, users: { select: { name: true, email: true } } },
  });
  if (!company) return { eventId, error: "No such company." };

  const event = await getDb().caseEvent.findFirst({
    where: { companyId: company.id, id: eventId, type: "case.raised" },
    select: { id: true, targetId: true, payload: true },
  });
  if (!event) return { eventId, error: "That raise is no longer in the log." };

  const result = await deliverRaisedNotice(
    company.id,
    buildRaisedNotice({
      slug,
      eventId: event.id,
      caseId: event.targetId ?? "",
      payload: (event.payload ?? {}) as EventPayload,
      seed: await companySeed(company),
      people: company.users,
      day: company.demoDay,
      baseUrl: companyBaseUrl(slug),
    }),
    8000, // A person is watching this one, so give the relay longer than the raise path does.
  );

  if (!result.ok) return { eventId, error: result.error };
  revalidatePath("/admin", "layout");
  return { eventId, ok: true };
}

// ── Database ─────────────────────────────────────────────────────────────────

/**
 * What Postgres says about itself. Never throws: if the read fails mid-flight the page shows the
 * "not answering" state, which is the honest answer and the one the card exists for.
 */
export async function databaseReport(): Promise<DatabaseReport> {
  const configured = Boolean(process.env.DATABASE_URL);
  if (!(await isAdmin())) {
    return describeDatabase({ configured, outage: databaseOutage(), facts: null });
  }

  // Down? Ask again now rather than wait for the background retry: the page polls while the
  // database is off (DatabaseCard), so this is what turns "Postgres is back" into live data.
  if (!hasDatabase()) await reconnectDatabase();

  // orDemo, not a bare try/catch: a connection error here must also FLIP the mode flag, because
  // that is what makes hasDatabase() false for the rest of this render and sends the page down
  // the demo path instead of throwing a 500 at a reader who only wanted to know what was wrong.
  const facts = hasDatabase()
    ? await orDemo<DatabaseFacts | null>(() => databaseFacts(), () => null)
    : null;
  return describeDatabase({ configured, outage: databaseOutage(), facts });
}

// ── Managing a company ───────────────────────────────────────────────────────

export type StageState = { slug?: string; stage?: string; error?: string };

/**
 * Move a company through demo -> sandbox -> pilot -> live (docs/INTEGRATIONS.md "Stages").
 *
 * It is a column, not a branch: nothing about the code changes, it is how we describe this
 * customer to ourselves. Which is exactly why it belongs on the page where the customer was
 * created, instead of in a psql session.
 */
export async function setCompanyStageAction(_prev: StageState, form: FormData): Promise<StageState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };

  const slug = String(form.get("slug") ?? "");
  const stage = String(form.get("stage") ?? "");
  if (!isStage(stage)) return { slug, error: `"${stage}" is not one of ${STAGES.join(", ")}.` };

  const current = await getDb().company.findUnique({ where: { slug }, select: { stage: true } });
  if (!current) return { slug, error: "No such company." };
  if (!canMoveStage(current.stage, stage)) {
    return {
      slug,
      error: `${slug} holds real people. Moving it back to demo would switch the reset and "become someone else" tools back on over their cases - create a separate demo company instead.`,
    };
  }

  // Every session signed before the move ends: a demo visitor must not keep a way into real cases.
  await getDb().company.update({ where: { slug }, data: { stage, sessionEpoch: { increment: 1 } } });

  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  return { slug, stage };
}
