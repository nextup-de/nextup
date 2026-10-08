// Playwright, visual suite (`npm run e2e:visual`): the main pages at the four screen sizes from
// docs/RESPONSIVE.md, compared pixel by pixel with approved screenshots. It catches a size, a gap
// or a line break that changed without anyone meaning it to. Run by hand, like the fluid sweep:
//
//   npm run dev                                          # another terminal (demo mode, no database)
//   npm run e2e:visual -- --update-snapshots             # before your change: record the approved set
//   npm run e2e:visual                                   # after it: compare, every page x size that moved fails
//
// The approved screenshots depend on the machine (fonts render differently per OS), so each machine
// records its own: tests/e2e/visual/__screenshots__/ is git-ignored. Not in CI for the same reason.
import { defineConfig, devices } from "@playwright/test";

const SIZES = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1366, height: 657 },
  monitor: { width: 1920, height: 960 },
} as const;

export default defineConfig({
  testDir: "tests/e2e/visual",
  testMatch: /\.visual\.ts$/,
  snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}",
  fullyParallel: true,
  // A laptop dev server compiles each page on first visit; keep the load modest.
  workers: 2,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    // Anti-aliasing differs a little between runs; a real size or layout change moves far more.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide", scale: "css" },
  },
  reporter: [["list"], ["html", { open: "on-failure", outputFolder: "playwright-report/visual" }]],
  use: {
    baseURL: process.env.VISUAL_BASE ?? "http://localhost:3000",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: Object.entries(SIZES).map(([name, viewport]) => ({
    name,
    use: { ...devices["Desktop Chrome"], viewport, deviceScaleFactor: 1, isMobile: false, hasTouch: name === "phone" },
  })),
});
