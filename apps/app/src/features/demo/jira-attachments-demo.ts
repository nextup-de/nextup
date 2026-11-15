// The Jira attachments the Files tool shows in the local demo (no Jira, no database): two sample rows on the project's first two Jira-linked
// steps, only while the project syncs. Nothing is stored or fetched (plan JSY D5, D15).
import { issueBrowseUrl } from "@/features/integrations/jira/attachments";
import type { AttachmentRow } from "@/features/integrations/jira/types";
import type { ReducedProject } from "@/features/projects/types";
import { DEMO_JIRA_SITE } from "@/features/projects/views";

const SAMPLES = [
  { filename: "stock-levels-overview.pdf", size: 412_000, mimeType: "application/pdf", who: "L. Brandt", daysAgo: 2 },
  { filename: "supplier-map-line3.png", size: 380_000, mimeType: "image/png", who: "K. Schmid", daysAgo: 9 },
] as const;

export function demoAttachments(p: Pick<ReducedProject, "sync" | "steps">, now = Date.now()): AttachmentRow[] {
  if (!p.sync?.on) return [];
  const linked = p.steps.filter((s) => !s.dropped && s.external && s.external.system === "jira").slice(0, SAMPLES.length);
  return linked.map((step, i) => {
    const key = step.external?.key ?? "";
    return {
      id: `demo-${i + 1}`, issueKey: key, filename: SAMPLES[i].filename, size: SAMPLES[i].size, mimeType: SAMPLES[i].mimeType,
      created: new Date(now - SAMPLES[i].daysAgo * 86_400_000).toISOString(), who: SAMPLES[i].who, stepId: step.id,
      openUrl: issueBrowseUrl({ siteUrl: DEMO_JIRA_SITE }, key),
    };
  });
}
