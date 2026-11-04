"use client";
import { useState, useTransition } from "react";
import { openSupportAccess, revokeSupportAccess } from "@/server/actions/support-access";
import { Banner, DataTable, PageHeader, SectionCard } from "@/components/ui/elements";
import { useFormat, useT } from "@/i18n/client";
import c from "@/app/admin/people/console.module.css";

export type SupportAccessView = {
  /** When the open grant ends (ISO), or null when none is open. */
  activeUntil: string | null;
  /** Last sign-in times (ISO), newest first. */
  signins: string[];
  /** A support session only reads; the buttons are hidden. */
  readOnly: boolean;
};

export function SupportAccess({ view }: { view: SupportAccessView }) {
  const t = useT();
  const f = useFormat();
  const [pending, start] = useTransition();
  const [issued, setIssued] = useState<{ code: string; until: string } | null>(null);
  const [denied, setDenied] = useState(false);
  const until = issued?.until ?? view.activeUntil;

  const open = () =>
    start(async () => {
      const r = await openSupportAccess();
      setDenied(!r.ok);
      if (r.ok) setIssued({ code: r.supportCode, until: r.validUntil });
    });
  const revoke = () =>
    start(async () => {
      const r = await revokeSupportAccess();
      setDenied(!r.ok);
      if (r.ok) setIssued(null);
    });

  return (
    <div className={c.page}>
      <PageHeader title={t("adminSupport.title")} />
      <SectionCard name="support">
        <div className={c.stack} data-testid="console-support-intro">
          <p className={c.note}>{t("adminSupport.intro")}</p>
          <div data-testid="console-support-state" role="status">
            <Banner tone={until ? "warn" : "quiet"}>
              {until ? t("adminSupport.active", { time: f.date(until, "dateTime") }) : t("adminSupport.inactive")}
            </Banner>
          </div>
          {view.readOnly ? (
            <p className={c.note}>{t("adminSupport.viewerReadOnly")}</p>
          ) : (
            <div className={c.stack}>
              <div className={c.inline}>
                <button className={c.primary} type="button" disabled={pending} onClick={open} data-testid="console-support-open">
                  {until ? t("adminSupport.openAgain") : t("adminSupport.open")}
                </button>
                {until ? (
                  <button className={c.btn} type="button" disabled={pending} onClick={revoke} data-testid="console-support-revoke">
                    {t("adminSupport.revoke")}
                  </button>
                ) : null}
              </div>
              {denied ? <p className={c.note} data-tone="error" role="alert">{t("adminSupport.notAllowed")}</p> : null}
            </div>
          )}
        </div>
      </SectionCard>
      {issued ? (
        <SectionCard title={t("adminSupport.codeTitle")} name="support-code">
          <div className={c.codeBox} data-testid="console-support-code-card">
            <code className={c.code} data-testid="console-support-code">{issued.code}</code>
            <p className={c.note}>{t("adminSupport.validUntil", { time: f.date(issued.until, "dateTime") })}</p>
            <p className={c.note} data-tone="warn">{t("adminSupport.codeOnce")}</p>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard title={t("adminSupport.signinsTitle")} name="support-signins">
        <div data-testid="console-support-signins">
          <DataTable
            rows={view.signins}
            rowKey={(s) => s}
            empty={t("adminSupport.signinsNone")}
            columns={[{ key: "at", header: t("adminSupport.signinsCol"), render: (s) => f.date(s, "dateTime") }]}
          />
        </div>
      </SectionCard>
    </div>
  );
}
