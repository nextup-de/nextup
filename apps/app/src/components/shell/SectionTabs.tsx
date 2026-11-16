"use client";
// The strip under the bar for a section with two or more pages at the same level (config/nav.ts, SECTION_TABS).
// `side`: the section's pages sit in its side view (AreaFrame), so only a phone, which has no side view, draws the strip.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Tabs } from "@/components/ui/elements";
import { sectionTabsFor, type SectionKey } from "@/config/nav";
import { useT } from "@/i18n/client";
import styles from "./SimpleShell.module.css";

export function SectionTabs({ section, active, side = false }: { section: SectionKey; active: string; side?: boolean }) {
  const { href, role, serverMode } = useDemo();
  const t = useT();
  const items = sectionTabsFor(section, { role, serverMode }).map((tab) => ({ key: tab.key, href: href(tab.href), label: t(tab.labelKey) }));
  const current = items.find((item) => item.key === active);
  return (
    <div className={styles.sectionTabs} data-section={section} data-side={side ? "true" : undefined} data-testid={`${section}-tabs`}>
      <Tabs items={items} current={active} label={current?.label ?? section} />
    </div>
  );
}
