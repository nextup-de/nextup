"use client";
// /[company] -> the role's home (ROLE_HOME). In server mode the role is the session's; in the
// local demo it is what this browser remembers, so the redirect happens client-side once the
// persisted state is in.
//
// `?as=member|leader|manager` picks the persona first (local demo only - a session's role is
// not a URL parameter). The company login page sends the demo visitor in with `?as=member`, so
// coming through the login always starts as the employee, whatever this browser last viewed as.
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ROLE_HOME, ROLES, type Role } from "@/config/roles";
import { setPrefs } from "@/lib/demo-log";
import { useDemo } from "./DemoProvider";
import { PageSkeleton } from "./shared/PageSkeleton";

const isRole = (s: string | null): s is Role => ROLES.includes(s as Role);

export function RoleRouter() {
  const { ready, role, href, seed, tenant, serverMode } = useDemo();
  const router = useRouter();
  const as = useSearchParams().get("as");
  useEffect(() => {
    if (!ready) return;
    let next = role;
    if (!serverMode && isRole(as) && as !== role) {
      const rp = seed.personas.find((p) => p.id === as);
      setPrefs(tenant.slug, { role: as, leadAs: null, ...(rp?.dept ? { dept: rp.dept } : {}) });
      next = as;
    }
    router.replace(href(ROLE_HOME[next]));
  }, [ready, role, as, serverMode, seed.personas, tenant.slug, href, router]);
  return <PageSkeleton kind={ROLE_HOME[role] === "/raise" ? "raise" : "list"} delay />;
}
