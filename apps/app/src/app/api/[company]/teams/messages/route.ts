// The Teams bot endpoint (TMS D14). The Bot Framework POSTs every activity here with a Bearer token;
// everything - token, tenant, Teams switch, dispatch - is server/teams/bot.ts's job.
//
//   POST /api/[company]/teams/messages
import { hasDatabase } from "@/lib/db/client";
import { handleActivity } from "@/server/teams/bot";

export const dynamic = "force-dynamic";

/** An activity is a few ids and a short text; a card submit adds a form. Never a file. */
const MAX_BODY = 256 * 1024;

type Ctx = { params: Promise<{ company: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { company } = await params;
  if (!hasDatabase()) return Response.json({ error: "No database configured." }, { status: 503 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return Response.json({ error: "Too large." }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "Too large." }, { status: 413 });

  let activity: unknown;
  try {
    activity = JSON.parse(raw);
  } catch {
    activity = null;
  }

  const result = await handleActivity(company, activity, request.headers.get("authorization"));
  return result.body === undefined ? new Response(null, { status: result.status }) : Response.json(result.body, { status: result.status });
}
