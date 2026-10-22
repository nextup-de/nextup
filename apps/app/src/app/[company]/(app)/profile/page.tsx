import { ProfileView } from "@/components/profile/ProfileView";
import { m365Card } from "@/server/m365-profile";

export const metadata = { title: "My profile" };

type Props = { params: Promise<{ company: string }>; searchParams: Promise<{ m365?: string }> };

export default async function MyProfilePage({ params, searchParams }: Props) {
  const [{ company }, { m365 }] = await Promise.all([params, searchParams]);
  return <ProfileView m365={await m365Card(company, m365)} />;
}
