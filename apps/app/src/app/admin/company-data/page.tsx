// Data: what NextUp holds for one company - a card per source (counts, never names), what the AI may
// read, and the map of where data comes from and who reads it (docs/plans/2026-10-21_company-data-page.md).
// The company admin sees its own company; the platform admin picks one (?company=<slug>) and also
// keeps what used to live on Knowledge: the assistant, idea studio and loop settings.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { assistantView, dataView, ideasView, knowledgeView } from "@/server/admin-insight";
import { adminBase } from "@/features/admin/nav";
import { DataOverview } from "@/components/admin/DataOverview";
import { KnowledgeView } from "@/components/admin/KnowledgeView";
import { AssistantAdmin } from "@/components/admin/AssistantAdmin";
import { CompanyMissing } from "@/components/admin/CompanyOverview";
import { IdeaStudioAdmin } from "@/components/admin/IdeaStudioAdmin";
import { LoopRulesAdmin } from "@/components/admin/LoopRulesAdmin";
import { loadLoopRules } from "@/lib/db/loop";
import styles from "../admin.module.css";

export default async function DataPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  const platform = ctx.scope === "platform";
  const { company } = await searchParams;
  const current = platform ? (ctx.companies.find((c) => c.slug === company) ?? ctx.companies[0] ?? null) : ctx.company;
  if (!current && !platform) return <CompanyMissing />;

  const id = ctx.live ? current?.id ?? null : null;
  const [data, knowledge] = await Promise.all([dataView(current, ctx.live), knowledgeView(id)]);
  // The settings forms are the platform admin's; a company admin has its own Assistant page.
  const assistant = platform ? await assistantView(id) : null;
  const ideas = platform ? await ideasView(id) : null;
  const loop = platform && ctx.live && current ? await loadLoopRules(current.id) : null;
  const name = current?.name ?? "this company";

  return (
    <>
      <section className={styles.card}>
        <h1>Data</h1>
        <p className="nh-hint">
          {knowledge.source === "tables"
            ? `What ${name} gives NextUp, and what the AI is allowed to read of it.`
            : knowledge.source === "demo"
              ? "No database, so this is the built-in demo company, converted to rows the way the seed script stores it."
              : `${name} has no knowledge rows yet - its structure is still read from its seed blob. Re-run the seed or recreate it from the demo template to fill them.`}
        </p>
        {platform && ctx.companies.length > 1 ? (
          <nav className={styles.pick} aria-label="Company">
            {ctx.companies.map((c) => (
              <a key={c.slug} href={`${adminBase()}/company-data?company=${encodeURIComponent(c.slug)}`} aria-current={c.slug === current?.slug ? "page" : undefined}>
                {c.name}
              </a>
            ))}
          </nav>
        ) : null}
      </section>
      {data ? <DataOverview view={data} companyName={name} showMap={platform} /> : null}
      {knowledge.source === "none" ? null : <KnowledgeView knowledge={knowledge.knowledge} profile={knowledge.profile} brief={knowledge.brief} />}
      {assistant && current ? <AssistantAdmin slug={current.slug} view={assistant} /> : null}
      {ideas && current ? <IdeaStudioAdmin slug={current.slug} {...ideas} /> : null}
      {loop && current ? <LoopRulesAdmin slug={current.slug} rules={loop} /> : null}
    </>
  );
}
