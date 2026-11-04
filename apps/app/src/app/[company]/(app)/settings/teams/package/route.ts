// GET: the Teams app package (TMS D15) for this stack's bot and host, as a zip. Company admins only; the
// company is the one in the path and the guard decides.
import { teamsApp } from "@/features/teams/config";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { buildAppPackage } from "@/server/teams/package";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }): Promise<Response> {
  const { company } = await params;
  if (!(await companyAdminOf(company))) return new Response(null, { status: 404 });
  const app = teamsApp();
  if (!app) return new Response(null, { status: 409 });
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || new URL(request.url).host;
  let body: Buffer;
  try {
    body = buildAppPackage({ appId: app.appId, host });
  } catch {
    return new Response(null, { status: 500 });
  }
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="nextup-teams-app.zip"',
      "cache-control": "no-store",
    },
  });
}
