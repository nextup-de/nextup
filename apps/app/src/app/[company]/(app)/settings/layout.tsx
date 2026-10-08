// Settings sub-navigation. Manager only (guard arrives with sessions in Phase 2).
import Link from "next/link";
import { companyPrefix } from "@/features/tenant/urls";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  const base = `${companyPrefix(company)}/settings`;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <nav aria-label="Settings" style={{ display: "flex", gap: 16, fontSize: "var(--nh-fs-md)" }}>
        <Link href={`${base}/company`}>Company</Link>
        <Link href={`${base}/members`}>Members</Link>
        <Link href={`${base}/routing`}>Routing table</Link>
      </nav>
      {children}
    </div>
  );
}
