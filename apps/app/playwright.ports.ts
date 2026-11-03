// The ports the e2e suites serve the app on. Each checkout gets its own, so suites in two worktrees or orch lanes can
// run at once: with CI unset a busy port is reused, which would test another checkout's server.
/** A port from `base` + 2 * (a hash of the checkout's folder mod 400); the next one up is free for a second server. */
export function checkoutPort(base: number, dir: string = process.cwd()): number {
  let h = 0;
  for (const c of dir.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return base + (h % 400) * 2;
}
