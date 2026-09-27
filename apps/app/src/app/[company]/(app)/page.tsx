// Role router: /[company] -> the role's home (ROLE_HOME). Server mode reads the session's role;
// the local demo the one this browser set (or `?as=`, see RoleRouter).
import { Suspense } from "react";
import { RoleRouter } from "@/components/dashboard/RoleRouter";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

export default function AppIndexPage() {
  // useSearchParams() needs a boundary above it; the fallback is the same skeleton the router shows.
  return (
    <Suspense fallback={<PageSkeleton kind="raise" />}>
      <RoleRouter />
    </Suspense>
  );
}
