// Every app page shows grey boxes until it is in (Next's loading.tsx = a Suspense boundary
// around the page). The routes with their own shape have their own loading.tsx next to them.
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

export default function Loading() {
  return <PageSkeleton kind="list" />;
}
