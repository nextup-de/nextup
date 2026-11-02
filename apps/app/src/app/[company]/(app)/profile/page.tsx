import { ProfileView } from "@/components/profile/ProfileView";
import { m365Card } from "@/server/m365-profile";
import { getT } from "@/i18n/server";
import { myNotifyPrefs } from "@/server/actions/notify";
import { getViewerFor } from "@/features/auth/session";

export async function generateMetadata() {
  return { title: (await getT())("shell.myProfile") };
}

type Props = { params: Promise<{ company: string }>; searchParams: Promise<{ m365?: string }> };

export default async function MyProfilePage({ params, searchParams }: Props) {
  const [{ company }, { m365 }] = await Promise.all([params, searchParams]);
  // Only a signed-in person has mail choices; without a session (or a database) the section is not shown.
  const mailPrefs = (await getViewerFor(company)) ? await myNotifyPrefs(company) : null;
  return <ProfileView m365={await m365Card(company, m365)} mailPrefs={mailPrefs} />;
}
