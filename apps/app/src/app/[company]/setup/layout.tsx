// The setup process: its own frame, outside the app shell and outside Settings. Each page checks who
// is asking for itself (server/setup-page.ts): a layout is no gate. This only reads who to show.
import { ROLE_HOME } from "@/config/roles";
import { SetupFrame } from "@/components/setup/SetupFrame";
import { getViewerFor } from "@/features/auth/session";
import { initialsOf } from "@/features/tenant/create";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { setupIsDemo } from "@/server/setup-page";

export default async function SetupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const viewer = setupIsDemo() ? null : await getViewerFor(company);
  return (
    <SetupFrame
      homeHref={companyPrefix(company) + ROLE_HOME[viewer?.role ?? "manager"]}
      leaveText={t("settingsSetup.leave")}
      initials={viewer ? initialsOf(viewer.name) : null}
    >
      {children}
    </SetupFrame>
  );
}
