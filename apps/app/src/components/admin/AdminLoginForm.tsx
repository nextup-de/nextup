"use client";
import { useActionState, useState } from "react";
import { adminSignIn, type AdminLoginState } from "@/server/actions/admin";
import { Field } from "@/components/ui/Field";
import styles from "@/app/admin/admin.module.css";

/**
 * `demoCode` is the server's own ADMIN_ACCESS_CODE, handed down only when the box sets
 * ADMIN_DEMO_FILL=true - a one-click fill for a live demo. It reaches the browser in the page
 * source, so the flag belongs on a demo box and nowhere else. Null means no button at all.
 */
export function AdminLoginForm({ demoCode }: { demoCode?: string | null }) {
  const [state, act, pending] = useActionState<AdminLoginState, FormData>(adminSignIn, {});
  const [code, setCode] = useState("");

  return (
    <form action={act} className={styles.grid} autoComplete="off">
      <Field id="code" label="Admin code">
        <div className={styles.inputWrap}>
          <input
            className={`nh-input ${demoCode ? styles.inputWithFill : ""}`}
            id="code"
            name="code"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
          />
          {demoCode ? (
            <button
              className={styles.fill}
              type="button"
              aria-label="Fill in the demo admin code"
              onClick={() => setCode(demoCode)}
            >
              Demo code
            </button>
          ) : null}
        </div>
      </Field>
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      <button className="nh-btn nh-btn-primary" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
