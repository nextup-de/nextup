"use client";
// The bug icon (docs/PLATFORM_PLAN.md, "Tickets"). Click: the screenshot is taken FIRST, of the page
// as it is, then the dialog opens with it as a preview. The person says what happened; the page,
// browser, the last pages visited, recent errors and failed requests come along on their own. Send stores it in this stack
// (server/actions/tickets.ts) and hands it to the NextUp team.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { OPENER_NAMES, PERSON_AREA, TEAM_NAMES } from "@nextup/contracts";
import type { ReportResult } from "@/server/actions/tickets";
import { installCapture, recentErrors, recentFailures, recentPages, recordPage, takeScreenshot } from "./capture";
import styles from "./ReportButton.module.css";

type Kind = "bug" | "idea" | "question";
type Impact = "blocks" | "annoying" | "cosmetic";

const KINDS: [Kind, string][] = [["bug", "Something's broken"], ["idea", "An idea"], ["question", "A question"]];
const IMPACTS: [Impact, string][] = [["blocks", "Blocks me"], ["annoying", "Annoying"], ["cosmetic", "Cosmetic"]];

type Props = {
  submit: (input: unknown) => Promise<ReportResult>;
  /** Where the person follows their reports, or null (e.g. /admin has no "My reports"). */
  reportsHref: string | null;
  /** Demo stacks: ask who of us opened it and who should take it. Never on a real company's stack. */
  team?: boolean;
};

export function ReportButton({ submit, reportsHref, team = false }: Props) {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [withShot, setWithShot] = useState(true);
  const [kind, setKind] = useState<Kind>("bug");
  const [impact, setImpact] = useState<Impact>("annoying");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [openedBy, setOpenedBy] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = useRef<HTMLTextAreaElement>(null);

  useEffect(() => installCapture(), []);
  const pathname = usePathname();
  useEffect(() => recordPage(pathname), [pathname]);

  const close = useCallback(() => {
    setOpen(false);
    if (sent) {
      setDescription("");
      setExpected("");
      setSent(null);
    }
  }, [sent]);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function begin() {
    setCapturing(true);
    const image = await takeScreenshot();
    setCapturing(false);
    setShot(image);
    setWithShot(image !== null);
    setError(null);
    setSent(null);
    setOpen(true);
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submit({
        kind,
        impact,
        description,
        expected: kind === "bug" ? expected : "",
        screenshot: withShot ? shot : null,
        ...(team ? { openedBy, assignee } : {}),
        context: {
          path: location.pathname,
          userAgent: navigator.userAgent.slice(0, 500),
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          consoleErrors: recentErrors(),
          failedRequests: recentFailures(),
          recentPages: recentPages(),
        },
      });
      if (res.ok) setSent(res.label);
      else setError(res.error);
    });
  }

  return (
    <div data-report-ui="">
      <button
        type="button"
        className={styles.fab}
        onClick={begin}
        disabled={capturing}
        aria-label="Report a problem or an idea to the NextUp team"
        title="Report a problem or an idea"
      >
        <BugIcon />
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={close} />
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="report-title">
            {sent ? (
              <div>
                <div className={styles.eyebrow}>Sent</div>
                <h2 id="report-title" className={styles.title}>Thanks, it&apos;s in as {sent}.</h2>
                <p className={styles.sub}>
                  The NextUp team sees it now. You&apos;ll get a mail when someone replies
                  {reportsHref ? (
                    <>
                      , and you can follow it under{" "}
                      <Link href={reportsHref} onClick={close}>My reports</Link>
                    </>
                  ) : null}
                  .
                </p>
                <div className={styles.actions}>
                  <button type="button" className="nh-btn nh-btn-primary" onClick={close}>Close</button>
                </div>
              </div>
            ) : (
              <form onSubmit={send}>
                <div className={styles.eyebrow}>Tell the NextUp team</div>
                <h2 id="report-title" className={styles.title}>What happened?</h2>

                <div className={styles.chips} role="radiogroup" aria-label="Kind">
                  {KINDS.map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} data-on={kind === k} className={styles.chip} onClick={() => setKind(k)}>
                      {label}
                    </button>
                  ))}
                </div>

                <label className={styles.textLabel} htmlFor="report-what">
                  {kind === "idea" ? "Your idea" : kind === "question" ? "Your question" : "What happened"}
                </label>
                <textarea
                  id="report-what"
                  ref={first}
                  className={styles.textarea}
                  rows={4}
                  maxLength={4000}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={kind === "bug" ? "I clicked … and then …" : ""}
                />

                {kind === "bug" && (
                  <>
                    <label className={styles.textLabel} htmlFor="report-expected">What did you expect?</label>
                    <textarea id="report-expected" className={styles.textarea} rows={2} maxLength={2000} value={expected} onChange={(e) => setExpected(e.target.value)} />

                    <div className={styles.textLabel}>How much does it get in your way?</div>
                    <div className={styles.chips} role="radiogroup" aria-label="Impact">
                      {IMPACTS.map(([i, label]) => (
                        <button key={i} type="button" role="radio" aria-checked={impact === i} data-on={impact === i} className={styles.chip} onClick={() => setImpact(i)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {team && (
                  <>
                    <div className={styles.textLabel}>Opened by</div>
                    <div className={styles.chips} role="radiogroup" aria-label="Opened by">
                      {[...OPENER_NAMES, ""].map((n) => (
                        <button key={n || "unknown"} type="button" role="radio" aria-checked={openedBy === n} data-on={openedBy === n} className={styles.chip} onClick={() => setOpenedBy(n)}>
                          {n ? <>{n} <span className={styles.chipNote}>{PERSON_AREA[n as keyof typeof PERSON_AREA]}</span></> : "Somebody unknown"}
                        </button>
                      ))}
                    </div>

                    <div className={styles.textLabel}>Assign to <span className={styles.optional}>optional</span></div>
                    <div className={styles.chips} role="radiogroup" aria-label="Assign to">
                      {["", ...TEAM_NAMES].map((n) => (
                        <button key={n || "nobody"} type="button" role="radio" aria-checked={assignee === n} data-on={assignee === n} className={styles.chip} onClick={() => setAssignee(n)}>
                          {n ? <>{n} <span className={styles.chipNote}>{PERSON_AREA[n as keyof typeof PERSON_AREA]}</span></> : "Nobody yet"}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {shot ? (
                  <div className={styles.shot}>
                    <label className={styles.shotToggle}>
                      <input type="checkbox" checked={withShot} onChange={(e) => setWithShot(e.target.checked)} />
                      Include this screenshot
                    </label>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL made on this page, nothing for next/image to optimise */}
                    <img src={shot} alt="Screenshot of the page as you saw it" className={styles.shotImg} data-off={!withShot} />
                    <p className={styles.fine}>Password fields are blurred. Untick it if anything on screen shouldn&apos;t leave your company.</p>
                  </div>
                ) : (
                  <p className={styles.fine}>No screenshot this time: this browser couldn&apos;t take one.</p>
                )}

                <p className={styles.fine}>
                  Sent along: this page&apos;s address, your browser and recent error messages. Not your name: the team sees your role only.
                </p>

                {error && <p className={styles.error} role="alert">{error}</p>}

                <div className={styles.actions}>
                  <button type="submit" className="nh-btn nh-btn-primary" disabled={pending || !description.trim()}>
                    {pending ? "Sending…" : "Send"}
                  </button>
                  <button type="button" className="nh-btn nh-btn-ghost" onClick={close}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BugIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 7.5a4 4 0 0 1 8 0" />
      <rect x="7" y="7.5" width="10" height="11" rx="5" />
      <path d="M12 11v7.5M3.5 9.5 7 11M20.5 9.5 17 11M3 14.5h4M21 14.5h-4M4 19.5l3.3-2.2M20 19.5l-3.3-2.2M9.5 4.5 8 3M14.5 4.5 16 3" />
    </svg>
  );
}
