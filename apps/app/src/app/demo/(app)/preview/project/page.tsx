// The project the yes opened: setup, board and agent, in tabs (?tab=).
import { PreviewProject } from "@/components/demo/preview/PreviewProject";
import { previewTabOf } from "@/features/demo/preview/state";
export default async function PreviewProjectPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  return <PreviewProject tab={previewTabOf((await searchParams).tab)} />;
}
