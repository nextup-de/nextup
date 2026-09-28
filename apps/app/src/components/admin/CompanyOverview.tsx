// The company admin's front page (features/admin/nav.ts, adminScope "company"): who can get in,
// whether the assistant is on, and what needs doing. Nothing about servers, other companies or our
// own tooling - that is admin.sellux.ch. Props in, JSX out.
import type { CompanyRow } from "@/features/admin/rows";
import { lockedOut } from "@/features/admin/nav";
import { STAGE_MEANING, type Stage } from "@/features/admin/stages";
import type { AssistantView } from "@/server/admin-insight";
import styles from "@/app/admin/admin.module.css";

export function CompanyOverview({ company, assistant, base }: { company: CompanyRow; assistant: AssistantView; base: string }) {
  const locked = lockedOut(company);
  const canSignIn = company.persons.length - locked.length;
  const todo: { text: string; href: string; action: string }[] = [];
  if (locked.length) {
    todo.push({
      text: `${locked.length} ${locked.length === 1 ? "person has" : "people have"} no way to sign in yet: ${names(locked.map((p) => p.name))}.`,
      href: `${base}/people`,
      action: "Issue login codes",
    });
  }
  if (assistant?.settings.enabled && !assistant.settings.dpaSignedAt) {
    todo.push({
      text: "The assistant is on, but no data-processing agreement is recorded - it will not call a model for your people until one is.",
      href: `${base}/assistant`,
      action: "Record the agreement",
    });
  }

  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h1>{company.name}</h1>
          <span className={styles.stage} title={STAGE_MEANING[company.stage as Stage]}>{company.stage}</span>
        </div>
        <p className={`nh-hint ${styles.lead}`}>
          <a href={company.url}>{company.url}</a> · Who can sign in, and how the assistant treats your documents.
        </p>
        <div className={styles.counts}>
          <a className={styles.count} href={`${base}/people`}>
            <span className={styles.countValue}>{company.persons.length}</span>
            <span className={styles.countLabel}>{company.persons.length === 1 ? "person" : "people"}</span>
          </a>
          <a className={styles.count} href={`${base}/people`} data-tone={locked.length ? "warn" : undefined}>
            <span className={styles.countValue}>{canSignIn} / {company.persons.length}</span>
            <span className={styles.countLabel}>can sign in</span>
          </a>
          <a className={styles.count} href={`${base}/people#microsoft`}>
            <span className={styles.countValue}>{company.entraTenantId ? "On" : "Off"}</span>
            <span className={styles.countLabel}>Microsoft sign-in</span>
          </a>
          <a className={styles.count} href={`${base}/assistant`}>
            <span className={styles.countValue}>{assistant ? (assistant.settings.enabled ? "On" : "Off") : "-"}</span>
            <span className={styles.countLabel}>assistant</span>
          </a>
        </div>
      </section>

      <section className={styles.card}>
        <h2>To do</h2>
        {todo.length ? (
          <div className={styles.rows}>
            {todo.map((t) => (
              <div key={t.href + t.action} className={styles.row}>
                <span>{t.text}</span>
                <a className="nh-btn nh-btn-ghost nh-btn-sm" href={t.href}>{t.action}</a>
              </div>
            ))}
          </div>
        ) : (
          <p className="nh-hint">Nothing. Everyone can sign in.</p>
        )}
      </section>

      <section className={styles.card}>
        <h2>Something not working?</h2>
        <p className="nh-hint">
          Use the bug icon at the bottom left of any page, here or in the dashboard. It goes straight to
          the NextUp team with a screenshot, and their answer reaches the person who reported it by mail.
        </p>
      </section>
    </>
  );
}

/** "Anna, Ben and 3 more" - the first few names, never a wall of them. */
function names(all: string[]): string {
  const shown = all.slice(0, 3);
  const more = all.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0] ?? "";
}

/** A company stack whose database does not hold its COMPANY_SLUG yet - the seed has not run. */
export function CompanyMissing() {
  return (
    <section className={styles.card}>
      <h1>Not set up yet</h1>
      <p className="nh-hint">This NextUp has no company in its database yet. The NextUp team finishes the setup - nothing to do here.</p>
    </section>
  );
}
