// What the bug icon collects on its own, in the browser: recent errors, failed requests, and a
// screenshot of what the person is looking at. Nothing leaves the page until they press Send.
"use client";

const MAX = 20;
const errors: string[] = [];
const failures: string[] = [];

const push = (list: string[], line: string) => {
  list.push(line.slice(0, 500));
  if (list.length > MAX) list.shift();
};

const text = (v: unknown) => (v instanceof Error ? `${v.name}: ${v.message}` : typeof v === "string" ? v : JSON.stringify(v) ?? String(v));

/** Path only - a query string can carry codes or tokens, and the developer does not need them. */
const pathOf = (url: string) => {
  try {
    return new URL(url, location.href).pathname;
  } catch {
    return "?";
  }
};

const flag = globalThis as unknown as { __nextupReportCapture?: true };

/** True while the screenshot is taken: the library's own fetches are not the app's failures. */
let capturing = false;

/** Start listening. Safe to call more than once; only the first call does anything. */
export function installCapture(): void {
  if (typeof window === "undefined" || flag.__nextupReportCapture) return;
  flag.__nextupReportCapture = true;

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push(errors, args.map(text).join(" "));
    origError(...args);
  };
  window.addEventListener("error", (e) => push(errors, `${e.message} (${pathOf(e.filename || "")}:${e.lineno})`));
  window.addEventListener("unhandledrejection", (e) => push(errors, `Unhandled: ${text(e.reason)}`));

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    try {
      const res = await origFetch(input, init);
      if (!res.ok && !capturing) push(failures, `${method} ${pathOf(url)} -> ${res.status}`);
      return res;
    } catch (e) {
      if (!capturing) push(failures, `${method} ${pathOf(url)} -> ${text(e)}`);
      throw e;
    }
  };
}

export function recentErrors(): string[] {
  return [...errors];
}
export function recentFailures(): string[] {
  return [...failures];
}

const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

function isSamePageFragment(url: string): boolean {
  try {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) return false;
    // "#n" resolved against the page, or already mangled into a path segment ("/acme/%23n").
    return (u.hash !== "" && u.pathname === location.pathname) || u.pathname.includes("%23");
  } catch {
    return false;
  }
}

const LIMIT = 2_400_000; // decoded bytes; the server refuses more than 2.5 MB

const bytesOf = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/**
 * The visible part of the page as an image data: URL, or null if the browser can't.
 * Password fields and anything marked `data-private` are blurred before the capture; the report
 * button and dialog (`data-report-ui`) are left out.
 */
export async function takeScreenshot(): Promise<string | null> {
  try {
    const { domToCanvas } = await import("modern-screenshot");
    const root = document.documentElement;
    root.setAttribute("data-report-capturing", "");
    capturing = true;
    const scale = Math.min(1, 1440 / window.innerWidth);
    let full: HTMLCanvasElement;
    try {
      full = await domToCanvas(document.body, {
        scale,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#fff",
        filter: (node) => !(node instanceof Element && node.closest("[data-report-ui]")),
        // A reference into this same page (an SVG `url(#id)`) is not a file: don't fetch it.
        fetchFn: async (url) => (isSamePageFragment(url) ? BLANK : false),
      });
    } finally {
      capturing = false;
      root.removeAttribute("data-report-capturing");
    }
    // Only what was on screen: crop the full-page render to the viewport.
    const w = Math.round(window.innerWidth * scale);
    const h = Math.round(window.innerHeight * scale);
    const view = document.createElement("canvas");
    view.width = w;
    view.height = h;
    view.getContext("2d")?.drawImage(full, 0, Math.round(window.scrollY * scale), w, h, 0, 0, w, h);

    for (const [type, quality] of [["image/webp", 0.75], ["image/jpeg", 0.7], ["image/jpeg", 0.5]] as const) {
      const url = view.toDataURL(type, quality);
      if (url.startsWith(`data:${type}`) && bytesOf(url) <= LIMIT) return url;
    }
    return null;
  } catch (e) {
    console.warn("[report] screenshot failed", e);
    return null;
  }
}
