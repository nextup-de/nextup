"use client";
// Every app page shows grey boxes until it is in (Next's loading.tsx = a Suspense boundary
// around the page). On a page load this sits between [company]/loading.tsx and the page's own, so
// it takes its shape from the URL like they do: a fixed "list" here turned the inbox's boxes into a
// list and back while the page streamed in.
import { usePathname } from "next/navigation";
import { PageSkeleton, skeletonKindForPathname } from "@/components/dashboard/shared/PageSkeleton";

export default function Loading() {
  return <PageSkeleton kind={skeletonKindForPathname(usePathname())} />;
}
