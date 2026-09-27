// Companies: every customer, its stage, its people's login codes and API token - and the form that adds
// one. ?from=<pilot request id> pre-fills that form from the request.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { adminBase } from "@/features/admin/nav";
import { CompanyList } from "@/components/admin/CompanyList";
import { CreateCompany, type CreateInitial } from "@/components/admin/CreateCompany";
import styles from "../admin.module.css";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  const { from } = await searchParams;

  const source = from ? ctx.requests.find((r) => r.id === from) : undefined;
  const initial: CreateInitial | undefined = source
    ? { name: source.company, personName: source.name, personEmail: source.email }
    : undefined;

  return (
    <>
      <section className={styles.card}>
        <h1>Companies</h1>
        <p className="nh-hint">
          {ctx.companies.length === 0
            ? "None yet. Add the first one below - it is live the moment it is saved, no deploy."
            : ctx.companies.length === 1
              ? "1 company, on its own address."
              : `${ctx.companies.length} companies, each on its own address.`}
        </p>
        <CompanyList companies={ctx.companies} readOnly={!ctx.live} />
      </section>

      {ctx.live ? (
        <section className={styles.card} id="new">
          <h2>Add a company</h2>
          <p className="nh-hint">
            {source
              ? `Pre-filled from the pilot request of ${source.name} (${source.company}). Check the slug, then add the rest of the team.`
              : "The slug becomes the subdomain. Pick the demo template to clone Acme\u2019s content, or an empty one for a real customer starting from nothing."}
          </p>
          <CreateCompany key={source?.id ?? "blank"} initial={initial} />
        </section>
      ) : null}
    </>
  );
}
