"use client";
// A keypad of its own for codes (the phone keyboard is too small for gloves): 3 x 4 keys of 72 px,
// the digits, backspace, 0 and the page's action key. The digits show in boxes above (plan FLR, 07-shop-floor).
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import styles from "./Floor.module.css";

const REVEAL_MS = 1000;

export function FloorKeypad({ value, onChange, length, actionLabel, onAction, disabled = false }: {
  value: string; onChange: (next: string) => void; length: number; actionLabel: string; onAction: () => void; disabled?: boolean;
}) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const press = (digit: string) => {
    if (value.length >= length) return;
    onChange(value + digit);
    setRevealed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRevealed(false), REVEAL_MS);
  };

  return (
    <div data-testid="floor-keypad">
      <div className={styles.boxes} role="img" aria-label={t("floor.keypadDigits", { count: value.length, total: length })} data-testid="floor-keypad-boxes">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={styles.box}>
            {i < value.length ? (i === value.length - 1 && revealed ? value[i] : "•") : ""}
          </span>
        ))}
      </div>
      <div className={styles.keypad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={styles.key} disabled={disabled} data-testid={`floor-keypad-${d}`} onClick={() => press(d)}>{d}</button>
        ))}
        <button type="button" className={styles.key} disabled={disabled || value.length === 0} aria-label={t("floor.keypadBackspace")} data-testid="floor-keypad-back" onClick={() => onChange(value.slice(0, -1))}>{"⌫"}</button>
        <button type="button" className={styles.key} disabled={disabled} data-testid="floor-keypad-0" onClick={() => press("0")}>0</button>
        <button type="button" className={`${styles.key} ${styles.keyAction}`} disabled={disabled || value.length !== length} data-testid="floor-keypad-action" onClick={onAction}>{actionLabel}</button>
      </div>
    </div>
  );
}
