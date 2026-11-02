// One project, on the static demo's data.
import { getT } from "@/i18n/server";
import ProjectPage from "@/app/[company]/(app)/projects/[projectId]/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleProject") };
}
export default ProjectPage;
