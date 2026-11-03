"use client";
// The pairing page's one field (FLR-D1). Plain: the floor shell (FLR-B1) wraps it later.
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { pairDeviceAction, type PairState } from "@/server/actions/floor-pair";

export function PairForm({ slug }: { slug: string }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [state, setState] = useState<PairState | null>(null);
  const [pending, start] = useTransition();

  if (state?.ok) return <p role="status" data-testid="floor-pair-done">{t("floorDevices.pairDone", { label: state.label })}</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setState(await pairDeviceAction(slug, code)));
      }}
      data-testid="floor-pair-form"
    >
      <label className="nh-label" htmlFor="floor-pair-code">{t("floorDevices.pairCodeLabel")}</label>
      <input
        id="floor-pair-code"
        className="nh-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={12}
        inputMode="text"
        data-testid="floor-pair-code"
      />
      {state && !state.ok ? (
        <p className="nh-error" role="alert" data-testid="floor-pair-error">{state.message ?? (state.error ? t(state.error) : "")}</p>
      ) : null}
      <button className="nh-btn nh-btn-primary nh-btn-block" type="submit" disabled={pending || code.trim() === ""} data-testid="floor-pair-submit">
        {t("floorDevices.pairButton")}
      </button>
    </form>
  );
}
