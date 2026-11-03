import { buildOpenApi } from "@/features/api/openapi";

// Public: the API description needs no token.
export function GET() {
  return Response.json(buildOpenApi(), { headers: { "Cache-Control": "public, max-age=300" } });
}
