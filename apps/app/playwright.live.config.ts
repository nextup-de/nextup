// Playwright, live check (`npm run e2e:live`): the interview script (tests/e2e/demo/interview.spec.ts)
// against a stack that is already running - after a deploy, before an interview.
//
//   INTERVIEW_URL=https://acme.sellux.ch npm run e2e:live            (bash)
//   set INTERVIEW_URL=https://acme.sellux.ch&& npm run e2e:live      (cmd.exe)
//   INTERVIEW_URL=http://localhost:3000/acme npm run e2e:live        (a dev server with a database)
//
// It builds and starts nothing. The company must be demo-stage: the test signs in with the demo
// button on its login and switches person in the Dev panel. It raises one idea and deletes the
// case again when it is the only added one. The idea stays in the employee's "Your ideas" list -
// "Reset demo" does not clear that list yet.
import { defineConfig, devices } from "@playwright/test";

const url = process.env.INTERVIEW_URL;
if (!url || !/^https?:\/\//.test(url)) throw new Error("Set INTERVIEW_URL to the company's address, e.g. https://acme.sellux.ch");

export default defineConfig({
  testDir: "tests/e2e/demo",
  testMatch: /interview\.spec\.ts/,
  // The spec reads this to take the company's address from baseURL instead of the built-in /acme.
  metadata: { live: true },
  workers: 1,
  // Over the internet, and the coach may be a real model there.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "on-failure" }]],
  use: {
    baseURL: url,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
