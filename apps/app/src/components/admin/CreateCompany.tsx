"use client";
// Add a company. Slug normalised as you type, so the validator never has to silently rewrite it.
import { useActionState, useState } from "react";
import { createCompanyAction, type CreateState } from "@/server/actions/admin";
import { normaliseSlug } from "@/features/tenant/create";
import { ROLES } from "@/config/roles";
import { Field } from "@/components/ui/Field";
import styles from "@/app/admin/admin.module.css";

type PersonDraft = { key: number; name: string; email: string; role: string; dept: string };

const blank = (key: number, role = "member"): PersonDraft => ({ key, name: "", email: "", role, dept: "" });

/** Pre-fill from a pilot request (/admin/companies?from=<id>): its company, and its sender as manager. */
export type CreateInitial = { name: string; personName: string; personEmail: string };

export function CreateCompany({ initial }: { initial?: CreateInitial }) {
  const [state, act, pending] = useActionState<CreateState, FormData>(createCompanyAction, { status: "idle" });
  const [slug, setSlug] = useState(() => (initial ? normaliseSlug(initial.name) : ""));
  const [people, setPeople] = useState<PersonDraft[]>(() => [
    initial ? { ...blank(1, "manager"), name: initial.personName, email: initial.personEmail } : blank(1, "manager"),
    blank(2, "leader"),
    blank(3, "member"),
  ]);
  const [nextKey, setNextKey] = useState(4);

  if (state.status === "created") {
    return (
      <div className={styles.ok}>
        <strong>{state.slug} is live.</strong>
        <p className="nh-hint">
          Open it at <a href={state.url}>{state.url}</a>. Each person gets their own login code -
          give each one only to that person. Shown once; only hashes are stored. A lost code is
          replaced under the company&apos;s &ldquo;People &amp; sign-in&rdquo;.
        </p>
        {state.codes.map((c) => (
          <div key={c.email}>
            <strong>{c.name}</strong> <span className="nh-hint">· {c.email}</span>
            <div className={styles.code}>{c.code}</div>
          </div>
        ))}
        {state.warnings.map((w) => (
          <p key={w} className={styles.warn}>{w}</p>
        ))}
        <a className="nh-btn nh-btn-ghost" href="">Add another</a>
      </div>
    );
  }

  return (
    <form action={act} className={styles.grid} autoComplete="off">
      <div className={styles.two}>
        <Field id="name" label="Company name">
          <input className="nh-input" id="name" name="name" required placeholder="Bosch Rexroth AG" defaultValue={initial?.name} />
        </Field>
        <Field id="slug" label="Slug (the subdomain)">
          <input
            className="nh-input"
            id="slug"
            name="slug"
            required
            value={slug}
            onChange={(e) => setSlug(normaliseSlug(e.target.value))}
            placeholder="bosch-rexroth"
          />
        </Field>
      </div>

      <Field id="template" label="Starting content">
        <select className="nh-input" id="template" name="template" defaultValue="demo">
          <option value="demo">Demo data — a copy of Acme&rsquo;s cases, routes and org chart</option>
          <option value="empty">Empty — real customer, starts with nothing</option>
        </select>
      </Field>

      <Field
        id="stage"
        label="Who logs in"
        hint="Real people: login asks for their own work email, and the demo tools (switch person, reset, +1 day) are off. You can move a demo company to real later, never back."
      >
        <select className="nh-input" id="stage" name="stage" defaultValue="demo">
          <option value="demo">Demo — made-up people, for sales calls and walkthroughs</option>
          <option value="sandbox">Real people — a customer trying it out (sandbox)</option>
        </select>
      </Field>

      <fieldset className={styles.people}>
        <legend className="nh-hint">
          People who can log in. At least one manager. Names should match the seed&rsquo;s people, or
          their screens will look empty — you&rsquo;ll get a warning if they don&rsquo;t.
        </legend>
        {people.map((p, i) => (
          <div key={p.key} className={styles.person}>
            <input className="nh-input" name="personName" placeholder="T. Vogel" defaultValue={p.name} aria-label={`Name ${i + 1}`} />
            <input className="nh-input" name="personEmail" type="email" placeholder="t.vogel@company.example" defaultValue={p.email} aria-label={`Email ${i + 1}`} />
            <select className="nh-input" name="personRole" defaultValue={p.role} aria-label={`Role ${i + 1}`}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input className="nh-input" name="personDept" placeholder="Production" defaultValue={p.dept} aria-label={`Department ${i + 1}`} />
            <button
              type="button"
              className="nh-btn nh-btn-ghost nh-btn-sm"
              onClick={() => setPeople((ps) => (ps.length > 1 ? ps.filter((x) => x.key !== p.key) : ps))}
              aria-label={`Remove person ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="nh-btn nh-btn-ghost nh-btn-sm"
          onClick={() => { setPeople((ps) => [...ps, blank(nextKey)]); setNextKey((k) => k + 1); }}
        >
          + Add person
        </button>
      </fieldset>

      {state.status === "error" ? (
        <div role="alert">
          {state.problems.map((p) => <p key={p} className={styles.error}>{p}</p>)}
        </div>
      ) : null}

      <button className="nh-btn nh-btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create company"}
      </button>
    </form>
  );
}
