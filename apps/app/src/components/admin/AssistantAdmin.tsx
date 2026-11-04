"use client";
// /admin/assistant: the raise-page assistant for this company - its switches, what it did in 30 days
// (counts only: no per-person view, BetrVG §87) and the documents it may search.
// Client for the confirm step before a document is removed.
import { useState, useTransition } from "react";
import { LEVEL_LABEL, canUse, isLevel } from "@/features/assist/classify";
import type { AssistantView } from "@/server/admin-insight";
import { AssistSettingsForm } from "./AssistSettingsForm";
import { deleteDocumentAction } from "@/server/actions/assist-admin";
import { Banner, ConfirmDialog, DataTable, PageHeader, SectionCard } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import c from "@/app/admin/people/console.module.css";

type Doc = NonNullable<AssistantView>["documents"][number];

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) + "%" : "-");
const day = (d: Date) => d.toISOString().slice(0, 10);

export function AssistantAdmin({ view, privacyHref, connectorsHref }: { view: NonNullable<AssistantView>; privacyHref?: string; connectorsHref: string }) {
  const t = useT();
  const [removing, setRemoving] = useState<Doc | null>(null);
  const [, start] = useTransition();
  const remove = () => {
    if (!removing) return;
    const form = new FormData();
    form.set("id", removing.id);
    setRemoving(null);
    start(() => deleteDocumentAction(form));
  };
  const { settings: s, provider: p, stats: st, documents } = view;
  const providerLabel = { bedrock: "Amazon Bedrock", "azure-openai": "Azure OpenAI", "openai-compatible": t("adminPrivacy.providerOpenaiCompat") } as const;
  const tiles: [string, string][] = [
    [String(st.answers), t("adminPrivacy.tileAnswers")],
    [pct(st.solved, st.answers), t("adminPrivacy.tileSolved")],
    [pct(st.raised, st.answers), t("adminPrivacy.tileRaised")],
    [pct(st.unsourced, st.answers), t("adminPrivacy.tileUnsourced")],
    [String(st.blocked), t("adminPrivacy.tileBlocked")],
  ];
  const readable = documents.filter((d) => canUse(d.classification, s.ceiling)).length;
  const facts: [string, React.ReactNode][] = [
    [t("adminPrivacy.rowAnswering"), <>{s.enabled ? t("adminPrivacy.on") : t("adminPrivacy.off")} <span className={c.sub}>{t("adminPrivacy.rowAnsweringNote")}</span></>],
    [
      t("adminPrivacy.rowModel"),
      p.choice === "off" || p.choice === "mock" ? (
        <>{t("adminPrivacy.rowNoModel")} <span className={c.sub}>{p.choice === "off" ? t("adminPrivacy.rowAiOff") : t("adminPrivacy.rowLookupsOnly")}</span></>
      ) : (
        <><code className={c.mono}>{p.choice === "azure-openai" ? p.deployment || p.model : p.model}</code> <span className={c.sub}>{providerLabel[p.choice]}{p.choice === "bedrock" ? ", " + p.region : ""}</span></>
      ),
    ],
    [t("adminPrivacy.rowDpa"), s.dpaSignedAt ? t("adminPrivacy.rowDpaSigned", { date: day(s.dpaSignedAt) }) : <span className={c.note} data-tone="warn">{t("adminPrivacy.rowDpaMissing")}</span>],
    [t("adminPrivacy.rowCeiling"), <>{LEVEL_LABEL[s.ceiling]} <span className={c.sub}>{t("adminPrivacy.rowCeilingNote")}</span></>],
  ];

  return (
    <div className={c.page} data-testid="console-assistant">
      <PageHeader title={t("adminPrivacy.assistantTitle")} lede={t("adminPrivacy.assistantLead", { days: s.retentionDays })} />
      <Banner tone="quiet" action={<a href={connectorsHref} data-testid="console-assistant-connectors-link">{t("adminPrivacy.connectorsOpen")}</a>}>
        {t("adminPrivacy.connectorsLink")}
      </Banner>

      <SectionCard name="status">
        <dl className={c.facts}>
          {facts.map(([label, value]) => (
            <div key={label} className={c.fact}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className={c.tiles}>
          {tiles.map(([v, l]) => (
            <div key={l} className={c.tile}>
              <div className={c.tileValue}>{v}</div>
              <div className={c.tileLabel}>{l}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("adminPrivacy.settingsTitle")} name="settings">
        <AssistSettingsForm enabled={s.enabled} ceiling={s.ceiling} retentionDays={s.retentionDays}
          dpaSignedAt={s.dpaSignedAt ? day(s.dpaSignedAt) : ""} rules={s.rules} patterns={s.patterns} privacyHref={privacyHref} />
      </SectionCard>

      <SectionCard title={t("adminPrivacy.documents")} hint={t("adminPrivacy.documentsReadable", { readable, total: documents.length })} name="documents">
        <DataTable
          rows={documents}
          rowKey={(d) => d.id}
          empty={t("adminPrivacy.documentsNone")}
          columns={[
            { key: "title", header: t("adminPrivacy.colTitle"), width: "minmax(0, 2fr)", render: (d) => <>{d.title} <span className={c.sub}>{d.externalId}</span></> },
            { key: "source", header: t("adminPrivacy.colSource"), render: (d) => d.source },
            {
              key: "class",
              header: t("adminPrivacy.colClass"),
              render: (d) => (
                <>
                  {isLevel(d.classification) ? LEVEL_LABEL[d.classification] : d.classification}
                  {canUse(d.classification, s.ceiling) ? null : <span className={c.sub}>{t("adminPrivacy.notSearched")}</span>}
                </>
              ),
            },
            { key: "updated", header: t("adminPrivacy.colUpdated"), width: "110px", render: (d) => <span className={c.nowrap}>{day(d.updatedAt)}</span> },
            {
              key: "remove",
              header: "",
              width: "100px",
              render: (d) => (
                <button type="button" className={c.btn} aria-label={t("adminPrivacy.removeNamed", { title: d.title })} onClick={() => setRemoving(d)}>
                  {t("adminPrivacy.remove")}
                </button>
              ),
            },
          ]}
        />
      </SectionCard>

      {removing ? (
        <ConfirmDialog
          title={t("adminPrivacy.removeTitle")}
          text={t("adminPrivacy.removeText", { title: removing.title })}
          confirmLabel={t("adminPrivacy.remove")}
          cancelLabel={t("adminPrivacy.cancel")}
          danger
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
          testId="console-assistant-remove-dialog"
        />
      ) : null}
    </div>
  );
}
