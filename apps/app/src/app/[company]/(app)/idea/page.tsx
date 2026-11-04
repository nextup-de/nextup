// One idea or problem, open: /idea?id=<id>. The same page as /projects and /overview, because a row of
// the "Ideas" column opens in place. Without an id the view moves the address on to /projects.
import { ProjectsHub } from "@/components/projects/ProjectsHub";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("projects.hubIdeas") };
}
export default function IdeaPage() {
  return <ProjectsHub tab="ideas" />;
}
