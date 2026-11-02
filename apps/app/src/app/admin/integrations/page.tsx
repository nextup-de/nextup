// The old address of the connectors: Jira and the directory now live in the console (ITC-A1).
import { redirect } from "next/navigation";
import { adminBase } from "@/features/admin/nav";

export default function IntegrationsPage() {
  redirect(adminBase() + "/connectors");
}
