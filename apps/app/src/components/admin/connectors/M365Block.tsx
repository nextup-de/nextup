"use client";
// Console connectors: Microsoft 365 search. A count and a time, never a name.
import { useState, useTransition } from "react";
import { useFormat, useT } from "@/i18n/client";
import { disconnectEveryoneConsole, setConsoleM365, type ConsoleConnectorState } from "@/server/actions/console-connectors";
import { CODE_KEY } from "./codes";
import type { M365BlockView } from "./views";
import styles from "@/app/admin/admin.module.css";

export function M365Block({ view, readOnly }: { view: M365BlockView; readOnly: boolean }) {
  const t = useT();
  const f = useFormat();
  const [note, setNote] = useState<ConsoleConnectorState | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<ConsoleConnectorState>) => { setNote(null); start(async () => setNote(await fn())); };
  const off = pending || readOnly;
  return (
    <section className={styles.card} data-testid="console-connectors-m365">
      <h2>{t("adminConnectors.m365Title")}</h2>
      <p className="nh-hint">{t("adminConnectors.m365Hint")}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            <tr><th>{t("adminConnectors.m365Search")}</th><td data-testid="console-connectors-m365-state">{t(view.on ? "adminConnectors.on" : "adminConnectors.off")}</td></tr>
            <tr><th>{t("adminConnectors.m365Connected")}</th><td data-testid="console-connectors-m365-count">{view.connected} {t("adminConnectors.m365People")}</td></tr>
            <tr><th>{t("adminConnectors.m365LastSearch")}</th><td>{view.lastSearchAt ? f.date(view.lastSearchAt, "dateTime") : t("adminConnectors.never")}</td></tr>
          </tbody>
        </table>
      </div>
      {!view.microsoft ? <p className={styles.warn}>{t("adminConnectors.m365NoMicrosoft")}</p> : null}
      {!view.vault ? <p className={styles.warn}>{t("adminConnectors.errNoVault")}</p> : null}
      {note && !note.ok ? <p className={styles.error} role="alert">{t(CODE_KEY[note.code])}</p> : null}
      <div className={styles.jiraActions}>
        <button type="button" className={view.on ? "nh-btn" : "nh-btn nh-btn-primary"} data-testid="console-connectors-m365-switch"
          disabled={off || (!view.on && !(view.microsoft && view.vault))} onClick={() => act(() => setConsoleM365(!view.on))}>
          {t(view.on ? "adminConnectors.m365TurnOff" : "adminConnectors.m365TurnOn")}
        </button>
        {view.connected > 0 ? (
          <button type="button" className="nh-btn" data-testid="console-connectors-m365-disconnect" disabled={off} onClick={() => act(disconnectEveryoneConsole)}>
            {t("adminConnectors.m365Disconnect")} ({view.connected})
          </button>
        ) : null}
      </div>
    </section>
  );
}
