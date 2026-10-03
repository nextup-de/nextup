// POST /api/pilot-requests - the public site's /contact form lands here (docs/plans/2026-09-27_platform.md).
//
// The site (nextup-landing, its own container on the box) has no database, so it forwards each request with
// `Authorization: Bearer <PILOT_INTAKE_TOKEN>` and the visitor's address in `x-visitor-address`.
// Same checks as the in-app form (src/server/actions/pilot.ts): validate again, throttle per
// visitor, save one PilotRequest row, which shows up in /admin -> Requests.
//
// The proxy's matcher excludes /api, so this is never host-rewritten and never uses a cookie.
import { intakeTokenMatches } from "@/features/pilot/intake";
import { readPilotRequest, validatePilotRequest } from "@/features/pilot/request";
import { hasDatabase } from "@/lib/db/client";
import { savePilotRequest } from "@/lib/db/pilot";
import { clientKey, throttle } from "@/server/throttle";

export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status });

export async function POST(request: Request) {
  // No token configured = the door does not exist. 404, not 401: nothing to probe for.
  const expected = process.env.PILOT_INTAKE_TOKEN;
  if (!expected) return json({ error: "Not found." }, 404);
  if (!intakeTokenMatches(request.headers.get("authorization"), expected)) {
    return json({ error: "Missing or wrong bearer token." }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Body must be a JSON object." }, 400);
  }

  const values = readPilotRequest(body as Record<string, unknown>);
  const errors = validatePilotRequest(values);
  if (Object.keys(errors).length > 0) return json({ error: "Invalid request.", errors }, 422);

  if (!hasDatabase()) return json({ error: "No database configured." }, 503);

  // Behind the token the site is trusted to name the visitor; without the header every request
  // would count against the site's own address.
  const visitor = request.headers.get("x-visitor-address")?.trim() || (await clientKey());
  const wait = throttle("pilotRequest", visitor);
  if (wait) return json({ error: wait }, 429);

  try {
    const id = await savePilotRequest(values);
    return json({ id }, 201);
  } catch (err) {
    console.error("[pilot] intake could not save a request", err);
    return json({ error: "Could not save the request." }, 500);
  }
}
