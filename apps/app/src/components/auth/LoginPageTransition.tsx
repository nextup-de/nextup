"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./AuthShell.module.css";

type Props = {
  children: React.ReactNode;
  step: "find" | "company";
};

export function LoginPageTransition({ children, step }: Props) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const navigating = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (step === "find") router.prefetch("/acme/login");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router, step]);

  function navigate(href: string) {
    if (navigating.current) return;
    navigating.current = true;
    setLeaving(true);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260;
    timer.current = setTimeout(() => router.push(href), delay);
  }

  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a");
    if (!link || link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href);
    if (url.origin !== window.location.origin) return;
    if (step === "company" && url.pathname === "/login") {
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLDivElement>) {
    const form = event.target as HTMLFormElement;
    if (step !== "find" || form.tagName !== "FORM" || form.method.toLowerCase() !== "get") return;
    const url = new URL(form.action);
    if (url.origin !== window.location.origin || url.pathname !== "/acme/login") return;
    event.preventDefault();
    navigate(url.pathname + url.search);
  }

  const direction = leaving
    ? (step === "find" ? "Forward" : "Back")
    : (step === "find" ? "Back" : "Forward");
  const phase = leaving ? "Leaving" : "Entering";

  return (
    <div
      className={`${styles.shell} ${styles.artShell} ${styles[`transition${phase}${direction}`]}`}
      onClick={onClick}
      onSubmit={onSubmit}
    >
      {children}
    </div>
  );
}
