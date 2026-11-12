// The team leader's old address on the static demo: the inbox is at /inbox now (plan INB, D3). ?id= stays.
import { redirect } from "next/navigation";
import { staticDemoPrefix } from "@/features/tenant/urls";
export default async function DemoLeaderPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  redirect(staticDemoPrefix() + "/inbox" + (id ? "?id=" + encodeURIComponent(id) : ""));
}
