// The click-through preview of what comes next (nextup-context plans/2026-11-09_pilot-mvp-cheap-path.md,
// P1): templates at the yes, the setup checklist and the project agent, on made-up data, before any of
// it is built. Its own pages and its own state in memory (components/demo/preview); it writes nothing
// to the demo's event log, and the app's real pages do not know it.
import { PreviewProvider } from "@/components/demo/preview/PreviewProvider";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("preview.metaTitle") };
}

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <PreviewProvider>{children}</PreviewProvider>;
}
