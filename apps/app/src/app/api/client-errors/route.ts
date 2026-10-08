// POST /api/client-errors - a script error in someone's browser (src/components/report/error-reporter.ts,
// sent with navigator.sendBeacon). Counted by kind like a server error (src/server/errors.ts); from
// there it reaches admin.sellux.ch as an auto ticket.
//
// Public on purpose - a crash on the login page must report too - and therefore tight: same origin
// only, 8 KB at most, a budget per address, the body validated, and nothing about the person kept
// (no cookie read, no session, no address stored). Once a report is ours it gets 204, throttled or
// not, so there is nothing to probe.
//
// A route handler, not a server action: action ids change with every build, so a tab opened before
// a deploy - where "chunk failed to load" comes from - could not reach one, and sendBeacon needs a URL.
// The proxy's matcher excludes /api, so this is never host-rewritten.
import { CLIENT_REPORT_MAX_BYTES, ClientErrorInput, acceptClientReport, isBrowserNoise } from "@/features/errors";
import { appOrigin, singleCompany, tenantMode } from "@/features/tenant/urls";
import { recordError } from "@/server/errors";
import { clientKey, throttle } from "@/server/throttle";

export const dynamic = "force-dynamic";

const answer = (status: number) => new Response(null, { status });

export async function POST(request: Request) {
  const length = request.headers.get("content-length");
  const gate = acceptClientReport({
    secFetchSite: request.headers.get("sec-fetch-site"),
    origin: request.headers.get("origin"),
    contentLength: length === null ? null : Number(length),
    appOrigin: appOrigin(),
  });
  if (!gate.ok) return answer(gate.status);

  let input: ClientErrorInput;
  try {
    const text = await request.text();
    // A chunked body has no content-length to refuse it by.
    if (text.length > CLIENT_REPORT_MAX_BYTES) return answer(413);
    const parsed = ClientErrorInput.safeParse(JSON.parse(text));
    if (!parsed.success) return answer(400);
    input = parsed.data;
  } catch {
    return answer(400);
  }

  if (throttle("clientError", await clientKey())) return answer(204);
  if (isBrowserNoise(input)) return answer(204);

  // Path mode (a laptop): the first segment is the company. A one-company stack has none in its paths.
  const slug = singleCompany() ?? (tenantMode() === "path" ? input.path.split("/")[1] : undefined);
  recordError("client", { name: input.name, message: input.message, stack: input.stack }, input.path, slug);
  return answer(204);
}
