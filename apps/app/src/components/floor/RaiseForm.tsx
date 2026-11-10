"use client";
// Raise from an area in two screens: what (two tiles), then say it (title, detail, Send).
// The text lives in the page's memory only; nothing is stored on a shared device (plan FLR, D7).
import Link from "next/link";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ideas/raiseIcons";
import { DeptChip } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import { floorRaiseAction } from "@/server/actions/floor";
import { BODY_MAX, TITLE_MAX } from "@/features/floor/raise";
import styles from "./Floor.module.css";

type Kind = "problem" | "idea";
const MIN_TITLE = 3;

export function RaiseForm({ slug, areaKey, areaName, unitName, roleTitle, vacant, anonymousAllowed, signedInName, signInHref }: {
  slug: string; areaKey: string; areaName: string; unitName: string; roleTitle: string; vacant: boolean;
  anonymousAllowed: boolean; signedInName: string | null; signInHref: string;
}) {
  const t = useT();
  const [kind, setKind] = useState<Kind | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // One nonce per form: a double tap sends the same key and writes one case.
  const [nonce] = useState(() => crypto.randomUUID().replace(/-/g, ""));

  const send = () => {
    if (!kind) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError(t("floor.offline"));
      return;
    }
    setError(null);
    start(async () => {
      try {
        const res = await floorRaiseAction(slug, { area: areaKey, kind, title, body, nonce });
        // A success redirects; only a refusal comes back here.
        if (res.reason === "limited") setError(res.message ?? t("floor.sendFailed"));
        else if (res.reason === "paused") setError(t("floor.pausedTitle"));
        else if (res.reason === "unknown") setError(t("floor.unknownTitle"));
        else if (res.reason === "anonymousOff") setError(t("floor.codeOnly"));
        else setError(t("floor.sendFailed"));
      } catch (e) {
        // Next's redirect is thrown through the action call; let it pass.
        if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setError(navigator.onLine ? t("floor.sendFailed") : t("floor.offline"));
      }
    });
  };

  const goesTo = (
    <>
      <p className={styles.hint} data-testid="floor-raise-goesto">{t("floor.goesTo", { role: roleTitle })}</p>
      {vacant ? <p className={styles.hint} data-testid="floor-raise-vacant">{t("floor.vacant")}</p> : null}
      <p className={styles.hint} data-testid="floor-raise-name">
        {signedInName ? t("floor.raisedAs", { name: signedInName }) : anonymousAllowed ? t("floor.withoutName") : t("floor.codeOnly")}
      </p>
    </>
  );

  if (!kind) {
    return (
      <div className={styles.page} data-testid="floor-raise-what">
        <p className={styles.place} data-testid="floor-raise-place"><DeptChip name={unitName} /> · {areaName}</p>
        <h1 className={styles.heading}>{t("floor.question")}</h1>
        <button type="button" className={styles.tile} data-testid="floor-raise-problem" onClick={() => setKind("problem")}>
          <Icon name="bolt" size={32} />{t("floor.tileProblem")}
        </button>
        <button type="button" className={styles.tile} data-testid="floor-raise-idea" onClick={() => setKind("idea")}>
          <Icon name="idea" size={32} />{t("floor.tileIdea")}
        </button>
        {goesTo}
        {signedInName ? null : <Link href={signInHref} className={styles.second} data-testid="floor-raise-signin">{t("floor.signIn")}</Link>}
      </div>
    );
  }

  return (
    <form className={styles.page} data-testid="floor-raise-say" onSubmit={(e) => { e.preventDefault(); if (title.trim().length >= MIN_TITLE && !pending) send(); }}>
      <button type="button" className={styles.second} disabled={pending} data-testid="floor-raise-back" onClick={() => setKind(null)}>{t("floor.back")}</button>
      <h1 className={styles.heading}>{kind === "problem" ? t("floor.headingProblem", { area: areaName }) : t("floor.headingIdea", { area: areaName })}</h1>
      <label className={styles.label}>
        {t("floor.titleLabel")}
        <input className={styles.input} value={title} maxLength={TITLE_MAX} required autoComplete="off" data-testid="floor-raise-title" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className={styles.label}>
        {t("floor.bodyLabel")}
        <textarea className={styles.textarea} value={body} rows={4} maxLength={BODY_MAX} data-testid="floor-raise-body" onChange={(e) => setBody(e.target.value)} />
      </label>
      {error ? <p className={styles.panel} role="alert" data-testid="floor-raise-error">{error}</p> : null}
      <button type="submit" className={styles.main} disabled={pending || title.trim().length < MIN_TITLE} data-testid="floor-raise-send">
        {pending ? t("floor.sending") : t("floor.send")}
      </button>
      {goesTo}
    </form>
  );
}
