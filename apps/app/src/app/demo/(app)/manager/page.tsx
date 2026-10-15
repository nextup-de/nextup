// The manager's old address: the Dashboard lives at /dashboard now.
import { redirect } from "next/navigation";
import { staticDemoPrefix } from "@/features/tenant/urls";
export default function DemoManagerPage() {
  redirect(staticDemoPrefix() + "/dashboard");
}
