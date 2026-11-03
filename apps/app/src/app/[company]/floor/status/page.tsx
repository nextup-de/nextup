// Status by reference (plan FLR, D8, D12). The reference is typed, or read from the URL fragment in
// the browser; it never reaches this server component.
import { StatusView } from "@/components/floor/StatusView";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("floor.statusHeading") };
}

export default async function FloorStatusPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return <StatusView slug={company} />;
}
