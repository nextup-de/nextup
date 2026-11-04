// /admin/decisions: every raise, what the router proposed, and whether people agreed. The summary
// says how often the proposal holds; the table says where it did not. Props in, JSX out.
import type { DecisionRow, DecisionSummary, Verdict } from "@/features/admin/decisions";
import type { MessageKey, T } from "@/i18n";
import { DataTable, PageHeader, SectionCard } from "@/components/ui/elements";
import c from "@/app/admin/people/console.module.css";

type Props = {
  rows: DecisionRow[];
  summary: DecisionSummary;
  /** company slug -> route id -> request type, so a row reads "r3 · Quality data", not just "r3". */
  routeNames: Record<string, Record<string, string>>;
  exportHref: string;
  t: T;
};

const VERDICT: Record<Verdict, MessageKey> = {
  agreed: "adminPrivacy.verdictAgreed",
  overridden: "adminPrivacy.verdictOverridden",
  "handed elsewhere": "adminPrivacy.verdictHanded",
  "no route": "adminPrivacy.verdictNoRoute",
  open: "adminPrivacy.verdictOpen",
};

const pct = (x: number | null) => (x === null ? "-" : Math.round(x * 100) + "%");
const when = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");

export function DecisionLog({ rows, summary: s, routeNames, exportHref, t }: Props) {
  const route = (company: string, id: string | null) =>
    id === null ? <span className={c.sub}>{t("adminPrivacy.routeNone")}</span> : (
      <>
        <code className={c.mono}>{id}</code>
        <span className={c.sub}>{routeNames[company]?.[id] ?? t("adminPrivacy.routeUnknown")}</span>
      </>
    );

  const tiles: [string, string][] = [
    [String(s.raised), t("adminPrivacy.tileRaisedCases")],
    [pct(s.agreement), t("adminPrivacy.tileHeld")],
    [String(s.overridden), t("adminPrivacy.tileOverridden")],
    [String(s.handedElsewhere), t("adminPrivacy.tileHanded")],
    [String(s.noRoute), t("adminPrivacy.tileNoRoute")],
    [String(s.open), t("adminPrivacy.tileOpen")],
    [s.meanConfidence === null ? "-" : s.meanConfidence + "%", t("adminPrivacy.tileConfidence")],
    [String(s.notified), t("adminPrivacy.tileNotified")],
  ];

  return (
    <div className={c.page} data-wide>
      <PageHeader
        title={t("adminPrivacy.routingTitle")}
        lede={t("adminPrivacy.routingLead")}
        action={<a className={c.btn} href={exportHref} download data-testid="console-routing-export">{t("adminPrivacy.routingExport")}</a>}
      />

      <SectionCard name="summary">
        <div className={c.tiles} data-testid="console-routing-tiles">
          {tiles.map(([v, l]) => (
            <div key={l} className={c.tile}>
              <div className={c.tileValue}>{v}</div>
              <div className={c.tileLabel}>{l}</div>
            </div>
          ))}
        </div>
        {s.byVersion.length > 1 ? (
          <DataTable
            rows={s.byVersion}
            rowKey={(v) => v.version}
            empty={t("adminConsole.none")}
            columns={[
              { key: "version", header: t("adminPrivacy.colVersion"), width: "minmax(0, 1.4fr)", render: (v) => <code className={c.mono}>{v.version}</code> },
              { key: "raised", header: t("adminPrivacy.colRaised"), render: (v) => v.raised },
              { key: "agreed", header: t("adminPrivacy.colAgreed"), render: (v) => v.agreed },
              { key: "overridden", header: t("adminPrivacy.colOverridden"), render: (v) => v.overridden },
              { key: "handed", header: t("adminPrivacy.colHanded"), render: (v) => v.handedElsewhere },
              { key: "noRoute", header: t("adminPrivacy.colNoRoute"), render: (v) => v.noRoute },
            ]}
          />
        ) : null}
      </SectionCard>

      <SectionCard title={t("adminPrivacy.raisesTitle")} hint={t("adminPrivacy.raisesMeta")} name="raises">
        <DataTable
          rows={rows}
          rowKey={(r) => r.eventId}
          empty={t("adminPrivacy.raisesNone")}
          columns={[
            { key: "when", header: t("adminPrivacy.colWhen"), width: "130px", render: (r) => <><span className={c.nowrap}>{when(r.raisedAt)}</span><span className={c.sub}>{r.company}</span></> },
            {
              key: "case",
              header: t("adminPrivacy.colCase"),
              width: "minmax(0, 1.6fr)",
              render: (r) => (
                <>
                  {r.title || <em>{t("adminPrivacy.untitled")}</em>}
                  <span className={c.sub}>{r.answer ? t("adminPrivacy.answered", { answer: t(r.answer === "yes" ? "adminPrivacy.answerYes" : "adminPrivacy.answerNo") }) : t("adminPrivacy.noAnswer")}</span>
                </>
              ),
            },
            { key: "proposed", header: t("adminPrivacy.colProposed"), width: "minmax(0, 1.2fr)", render: (r) => route(r.company, r.proposed) },
            {
              key: "confidence",
              header: t("adminPrivacy.colConfidence"),
              width: "100px",
              render: (r) => (
                <>
                  <span className={c.nowrap}>{r.confidence === null ? "-" : r.confidence + "%"}</span>
                  <span className={c.sub}>{r.source === "unrecorded" ? t("adminPrivacy.notRecorded") : r.version}</span>
                </>
              ),
            },
            { key: "chosen", header: t("adminPrivacy.colChosen"), width: "minmax(0, 1.2fr)", render: (r) => route(r.company, r.chosen) },
            { key: "verdict", header: t("adminPrivacy.colVerdict"), width: "130px", render: (r) => <span className={c.verdict} data-v={r.verdict}>{t(VERDICT[r.verdict])}</span> },
            { key: "handoffs", header: t("adminPrivacy.colHandedOn"), width: "80px", render: (r) => (r.handoffs ? r.handoffs + "×" : "-") },
            { key: "n8n", header: t("adminPrivacy.colN8n"), width: "100px", render: (r) => <span className={c.nowrap}>{r.noticeAt ? t("adminPrivacy.writtenBack") : "-"}</span> },
          ]}
        />
      </SectionCard>
    </div>
  );
}
