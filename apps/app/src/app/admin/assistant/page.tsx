// Assistant (company admin only): the raise-page assistant for this company - on/off, what it may
// read, how long it keeps anything, and what it did in the last 30 days (counts only).
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { assistantView } from "@/server/admin-insight";
import { adminBase } from "@/features/admin/nav";
import { AssistantAdmin } from "@/components/admin/AssistantAdmin";
import { CompanyMissing } from "@/components/admin/CompanyOverview";
import styles from "../admin.module.css";

export default async function AssistantPage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  // The platform admin has this per company, under Knowledge.
  if (ctx.scope !== "company") notFound();
  if (!ctx.company) return <CompanyMissing />;
  const assistant = await assistantView(ctx.live ? ctx.company.id : null);

  return assistant ? (
    <AssistantAdmin slug={ctx.company.slug} view={assistant} />
  ) : (
    <section className={styles.card}>
      <h1>Assistant</h1>
      <p className="nh-hint">Its settings are stored in the database, which is not answering right now.</p>
    </section>
  );
}
