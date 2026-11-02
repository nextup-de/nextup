/** The /admin login may fill the break-glass code (ADMIN_DEMO_FILL) only on a demo company (ITC D7). */
export function demoFillAllowed(stage: string | null | undefined): boolean {
  return stage === "demo";
}
