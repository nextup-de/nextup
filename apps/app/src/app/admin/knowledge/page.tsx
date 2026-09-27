// Knowledge: one company's org units, roles, routing table and goals as stored in the knowledge
// tables, plus the brief a model would be handed. Read-only - editing comes in step 2
// (docs/COMPANY_KNOWLEDGE.md). ?company=<slug> picks the company.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { assistantView, knowledgeView } from "@/server/admin-insight";
import { adminBase } from "@/features/admin/nav";
import { KnowledgeView } from "@/components/admin/KnowledgeView";
import { AssistantAdmin } from "@/components/admin/AssistantAdmin";
import styles from "../admin.module.css";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  const { company } = await searchParams;
  const current = ctx.companies.find((c) => c.slug === company) ?? ctx.companies[0] ?? null;
  const view = await knowledgeView(ctx.live ? current?.id ?? null : null);
  const assistant = await assistantView(ctx.live ? current?.id ?? null : null);

  return (
    <>
      <section className={styles.card}>
        <h1>Knowledge</h1>
        <p className="nh-hint">
          {view.source === "tables"
            ? `What ${current?.name ?? "this company"} is, as the app and the AI read it: the knowledge tables, laid over its seed.`
            : view.source === "demo"
              ? "No database, so this is the built-in demo company, converted to rows the way the seed script stores it."
              : `${current?.name ?? "This company"} has no knowledge rows yet - its structure is still read from its seed blob. Re-run the seed or recreate it from the demo template to fill them.`}
        </p>
        {ctx.companies.length > 1 ? (
          <nav className={styles.pick} aria-label="Company">
            {ctx.companies.map((c) => (
              <a key={c.slug} href={`${adminBase()}/knowledge?company=${encodeURIComponent(c.slug)}`} aria-current={c.slug === current?.slug ? "page" : undefined}>
                {c.name}
              </a>
            ))}
          </nav>
        ) : null}
      </section>
      {view.source === "none" ? null : <KnowledgeView knowledge={view.knowledge} profile={view.profile} brief={view.brief} />}
      {assistant && current ? <AssistantAdmin slug={current.slug} view={assistant} /> : null}
    </>
  );
}
