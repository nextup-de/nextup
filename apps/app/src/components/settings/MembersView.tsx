"use client";
// The Members table plus "add a person". Every button posts a server action from
// src/server/actions/members.ts; a login code comes back once and is shown once, here.
import { useActionState } from "react";
import { ROLES } from "@/config/roles";
import {
  addMemberAction,
  issueMemberCodeAction,
  setMemberRoleAction,
  type AddState,
  type CodeState,
  type MemberRow,
  type RoleState,
} from "@/server/actions/members";
import styles from "./MembersView.module.css";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type Props = { slug: string; me: string; members: MemberRow[] };
type Coded = CodeState & Pick<AddState, "problems" | "warnings">;

export function MembersView({ slug, me, members }: Props) {
  const [roled, setRole, saving] = useActionState<RoleState, FormData>(setMemberRoleAction, {});
  // Adding a person and "New code" share one state, so the code on screen is always the latest.
  const [coded, codeAction, coding] = useActionState<Coded, FormData>(async (_prev, form) => {
    if (form.get("intent") === "add") {
      const r = await addMemberAction({}, form);
      return { ...r.added, problems: r.problems, warnings: r.warnings };
    }
    return issueMemberCodeAction({}, form);
  }, {});

  const fresh = coded.code && coded.name ? { name: coded.name, code: coded.code } : null;

  return (
    <div className={styles.wrap}>
      <p className="nh-hint">
        Everyone signs in with their own login code{members.some((m) => m.microsoft) ? " or with Microsoft" : ""}.
        A new code replaces the old one at once - that is also how you lock out a lost code.
      </p>

      {fresh ? (
        <div className={styles.code} role="status">
          <strong>Login code for {fresh.name}</strong>
          <span className={styles.codeValue}>{fresh.code}</span>
          <span className="nh-hint">Give it to {fresh.name} only - it signs in as them. It is shown this once.</span>
        </div>
      ) : null}
      {coded.warnings?.map((w) => <p key={w} className="nh-hint">{w}</p>)}
      {coded.error ? <p className="nh-error" role="alert">{coded.error}</p> : null}
      {roled.error ? <p className="nh-error" role="alert">{roled.error}</p> : null}
      {roled.saved ? <p className="nh-hint" role="status">{roled.saved}</p> : null}

      <ul className={styles.list}>
        {members.map((m) => (
          <li key={m.id} className={styles.row}>
            <span className={styles.who}>
              <strong>{m.name}{m.id === me ? " (you)" : ""}</strong>
              <span className={styles.sub}>{m.email}{m.dept ? ` · ${m.dept}` : ""}</span>
            </span>
            <span className={styles.sub}>
              {m.codeIssuedAt ? `Code since ${when(m.codeIssuedAt)}` : "No code yet"}
              {m.microsoft ? " · Microsoft linked" : ""}
            </span>
            <form action={setRole} className={styles.role}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="userId" value={m.id} />
              <select
                className="nh-select"
                name="role"
                defaultValue={m.role}
                aria-label={`Role of ${m.name}`}
                disabled={saving || m.id === me}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </form>
            <form action={codeAction}>
              <input type="hidden" name="slug" value={slug} />
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" name="userId" value={m.id} disabled={coding}>
                {m.codeIssuedAt ? "New code" : "Issue code"}
              </button>
            </form>
          </li>
        ))}
      </ul>

      <form action={codeAction} className={styles.add}>
        <h2 className={styles.addTitle}>Add a person</h2>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="intent" value="add" />
        <div className={styles.addFields}>
          <label className="nh-field">
            <span className="nh-label">Name</span>
            <input className="nh-input" name="name" required autoComplete="off" />
          </label>
          <label className="nh-field">
            <span className="nh-label">Work email</span>
            <input className="nh-input" name="email" type="email" required autoComplete="off" />
          </label>
          <label className="nh-field">
            <span className="nh-label">Department</span>
            <input className="nh-input" name="dept" autoComplete="off" />
          </label>
          <label className="nh-field">
            <span className="nh-label">Role</span>
            <select className="nh-select" name="role" defaultValue="member">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        {coded.problems?.map((p) => <p key={p} className="nh-error" role="alert">{p}</p>)}
        <div>
          <button className="nh-btn nh-btn-primary" type="submit" disabled={coding}>Add and issue a code</button>
        </div>
      </form>
    </div>
  );
}
