"use client";
// Above the app shell: shown while the (app) layout reads the company and its event log. The
// page skeleton inside picks its shape from the URL, so /acme/leader waits as an inbox.
//
// The login page sits under this boundary too, but it has no app chrome: it waits on the bare
// ground and its card slides in as usual, instead of flashing a grey nav bar and list rows.
import { usePathname } from "next/navigation";
import { Ground } from "@/components/shell/Ground";
import { ShellSkeleton } from "@/components/shell/ShellSkeleton";

export default function Loading() {
  // /acme/login in path mode, /login in subdomain mode.
  const onLogin = usePathname().split("/").filter(Boolean).slice(0, 2).includes("login");
  return onLogin ? <Ground /> : <ShellSkeleton />;
}
