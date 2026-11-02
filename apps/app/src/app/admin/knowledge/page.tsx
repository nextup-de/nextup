// Knowledge moved to Company data, /admin/company-data. The old address still works.
import { redirect } from "next/navigation";
import { adminBase } from "@/features/admin/nav";

export default function KnowledgePage() {
  redirect(`${adminBase()}/company-data`);
}
