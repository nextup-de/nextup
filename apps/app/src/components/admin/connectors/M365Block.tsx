"use client";
// Console connectors: Microsoft 365 search. A count and a time, never a name.
import { useState, useTransition } from "react";
import { m365Status } from "@/features/connectors/status";
import { useFormat, useT } from "@/i18n/client";
import { disconnectEveryoneConsole, setConsoleM365, type ConsoleConnectorState } from "@/server/actions/console-connectors";
import { CODE_KEY } from "./codes";
import { ConnectorCard, STATUS_KEY, Switch, type Note } from "./ConnectorCard";
import type { M365BlockView } from "./views";
import c from "./Connectors.module.css";

const PeopleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14a6.5 6.5 0 0 1 3.5 6" /></svg>
);

export function M365Block({ view, readOnly }: { view: M365BlockView; readOnly: boolean }) {
  const t = useT();
  const f = useFormat();
  const [note, setNote] = useState<ConsoleConnectorState | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<ConsoleConnectorState>) => { setNote(null); start(async () => setNote(await fn())); };
  const off = pending || readOnly;
  const status = m365Status(view);
  const notes: Note[] = [];
  if (!view.microsoft) notes.push({ tone: "warn", text: t("adminConnectors.m365NoMicrosoft") });
  if (!view.vault) notes.push({ tone: "warn", text: t("adminConnectors.errNoVault") });
  return (
    <ConnectorCard
      id="m365" testId="console-connectors-m365" icon={<PeopleIcon />} title={t("adminConnectors.m365Title")}
      status={status} statusLabel={t(STATUS_KEY[status])} lede={t("adminConnectors.m365Lede")} notes={notes}
      toggle={<Switch on={view.on} label={t("adminConnectors.switchLabel", { name: t("adminConnectors.m365Title") })} testId="console-connectors-m365-switch"
        disabled={off || (!view.on && !(view.microsoft && view.vault))} onChange={(next) => act(() => setConsoleM365(next))} />}
      factsTitle={t("adminConnectors.readsTitle")}
      facts={[
        { label: t("adminConnectors.factReads"), value: t("adminConnectors.m365Reads") },
        { label: t("adminConnectors.factNeverReads"), value: t("adminConnectors.m365Never") },
        { label: t("adminConnectors.m365Connected"), value: <span data-testid="console-connectors-m365-count">{view.connected} {t("adminConnectors.m365People")}</span> },
        { label: t("adminConnectors.m365LastSearch"), value: view.lastSearchAt ? f.date(view.lastSearchAt, "dateTime") : t("adminConnectors.never") },
        ...(view.microsoft ? [{ label: t("adminConnectors.factSignIn"), value: t("adminConnectors.m365SignInOk") }] : []),
      ]}>
      <div className={c.foot}>
        <p className={c.status} data-tone={note && !note.ok ? "error" : undefined} role={note && !note.ok ? "alert" : undefined}>
          {note && !note.ok ? t(CODE_KEY[note.code]) : t("adminConnectors.m365Foot")}
        </p>
        {view.connected > 0 ? (
          <button type="button" className={c.btn} data-testid="console-connectors-m365-disconnect" disabled={off} onClick={() => act(disconnectEveryoneConsole)}>
            {t("adminConnectors.m365Disconnect")} ({view.connected})
          </button>
        ) : null}
      </div>
    </ConnectorCard>
  );
}
