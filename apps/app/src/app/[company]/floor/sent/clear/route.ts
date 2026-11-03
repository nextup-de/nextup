// Deletes the one-time sent cookie once the sent page is on screen (plan FLR, D8).
import { cookies } from "next/headers";
import { FLOOR_SENT_COOKIE } from "@/features/floor/cookies";
import { floorPath } from "@/server/floor/raise";

export async function POST(_req: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  (await cookies()).delete({ name: FLOOR_SENT_COOKIE, path: floorPath(company) });
  return new Response(null, { status: 204 });
}
