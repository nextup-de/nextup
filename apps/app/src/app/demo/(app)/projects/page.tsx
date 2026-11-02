// The projects, on the static demo's data.
import { getT } from "@/i18n/server";
import ProjectsPage from "@/app/[company]/(app)/projects/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleProjects") };
}
export default ProjectsPage;
