import { redirect } from "next/navigation";
export default async function SettingsIndexPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  redirect(`/${company}/settings/company`);
}
