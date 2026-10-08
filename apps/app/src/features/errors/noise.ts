// Browser errors that aren't ours. Kept apart from ./index.ts, which needs node:crypto, so the
// browser's reporter (src/components/report/error-reporter.ts) can use the same rule.

/** Browser extensions, cross-origin scripts ("Script error."), a harmless ResizeObserver warning. */
export function isBrowserNoise(e: { message: string; stack: string }): boolean {
  return (
    /^Script error\.?$/.test(e.message.trim()) ||
    /ResizeObserver loop/.test(e.message) ||
    /(?:chrome|moz|safari(?:-web)?)-extension:\/\//.test(e.stack)
  );
}
