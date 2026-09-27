// Unlocks the admin area with ADMIN_ACCESS_CODE. Not a user account - there is no admin user.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import styles from "../admin.module.css";

/**
 * ADMIN_DEMO_FILL=true puts a "Demo code" button in the field so the code does not have to be
 * typed in front of a room. It sends ADMIN_ACCESS_CODE to the browser - only ever on a demo box,
 * never on a box whose admin area is worth protecting.
 */
function demoCode(): string | null {
  if (process.env.ADMIN_DEMO_FILL !== "true") return null;
  return process.env.ADMIN_ACCESS_CODE ?? null;
}

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect(process.env.TENANT_MODE === "subdomain" ? "/" : "/admin");
  return (
    <section className={styles.card}>
      <h1>Admin</h1>
      <p className="nh-hint">Add a company, hand out its people&apos;s login codes, or remove it.</p>
      <AdminLoginForm demoCode={demoCode()} />
    </section>
  );
}
