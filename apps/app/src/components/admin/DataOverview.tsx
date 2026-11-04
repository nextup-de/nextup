// /admin/company-data: what NextUp holds for one company - a card per source, what the AI may read, and
// the map of where each kind of data comes from and who reads it. Props in, JSX out.
import type { SourceCard } from "@/features/admin/data";
import type { DataView } from "@/server/admin-insight";
import { LEVEL_LABEL } from "@/features/assist/classify";
import { DataTable, SectionCard } from "@/components/ui/elements";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n";
import { DataMap } from "./DataMap";
import c from "@/app/admin/people/console.module.css";

const day = (d: Date) => d.toISOString().slice(0, 10);

function Source({ s, t }: { s: SourceCard; t: T }) {
  return (
    <li className={c.source} data-tone={s.tone ?? "off"}>
      <span className={c.sourceHead}>
        <span className={c.dot} aria-hidden="true" />
        {s.label}
        <span className={c.sub}>{s.state}</span>
      </span>
      <strong className={c.sourceSize}>{s.size}</strong>
      <span className={c.sub}>{t("adminPrivacy.sourceFrom", { origin: s.origin })}</span>
      <span className={c.sub}>{s.updatedAt ? t("adminPrivacy.sourceChanged", { date: day(s.updatedAt) }) : t("adminPrivacy.sourceNoDate")}</span>
      {s.note ? <span className={c.sourceNote}>{s.note}</span> : null}
    </li>
  );
}

export async function DataOverview({ view, companyName, showMap }: { view: NonNullable<DataView>; companyName: string; showMap: boolean }) {
  const t = await getT();
  const { cards, classes, ceiling, ai } = view;
  const facts: [string, React.ReactNode][] = [
    [t("adminPrivacy.rowCeiling"), <>{LEVEL_LABEL[ceiling]} <span className={c.sub}>{t("adminPrivacy.aiCeilingNote")}</span></>],
    ...(ai
      ? ([
          [t("adminPrivacy.fieldAssistant"), ai.enabled ? t("adminPrivacy.aiOn") : t("adminPrivacy.aiOff")],
          [t("adminPrivacy.aiMasked"), ai.patterns.length ? t("adminPrivacy.aiMaskedPatterns", { n: ai.patterns.length }) : t("adminPrivacy.aiMaskedBase")],
          [t("adminPrivacy.aiKept"), t("adminPrivacy.aiKeptValue", { days: ai.retentionDays })],
          [t("adminPrivacy.rowDpa"), ai.dpaSignedAt ? t("adminPrivacy.rowDpaSigned", { date: day(ai.dpaSignedAt) }) : t("adminPrivacy.aiDpaNo")],
        ] as [string, React.ReactNode][])
      : []),
  ];
  return (
    <>
      <SectionCard title={t("adminPrivacy.sourcesTitle")} hint={t("adminPrivacy.sourcesLead", { name: companyName })} name="sources">
        <ul className={c.sources} aria-label={t("adminPrivacy.sourcesTitle")}>
          {cards.map((s) => <Source key={s.id} s={s} t={t} />)}
        </ul>
      </SectionCard>

      <SectionCard title={t("adminPrivacy.aiTitle")} name="ai-reads">
        <dl className={c.facts}>
          {facts.map(([label, value]) => (
            <div key={label} className={c.fact}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <DataTable
          rows={classes}
          rowKey={(row) => row.level}
          empty={t("adminConsole.none")}
          columns={[
            { key: "class", header: t("adminPrivacy.classDocClass"), render: (row) => LEVEL_LABEL[row.level] },
            { key: "docs", header: t("adminPrivacy.classDocuments"), render: (row) => row.count },
            { key: "ai", header: t("adminPrivacy.classAi"), render: (row) => (row.searched ? t("adminPrivacy.classMaySearch") : t("adminPrivacy.classNeverSearched")) },
          ]}
        />
      </SectionCard>

      {showMap ? (
        <SectionCard title="Data map" hint="Where each kind of data comes from, which table holds it, and which part of NextUp reads it." name="data-map">
          <DataMap />
        </SectionCard>
      ) : null}
    </>
  );
}
