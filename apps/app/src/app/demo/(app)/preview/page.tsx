// The preview starts at the idea.
import { redirect } from "next/navigation";
import { staticDemoPrefix } from "@/features/tenant/urls";
export default function PreviewIndex() {
  redirect(staticDemoPrefix() + "/preview/case");
}
