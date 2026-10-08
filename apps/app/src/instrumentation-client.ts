// Runs in the browser after the HTML loads and before React hydrates (node_modules/next/dist/docs,
// instrumentation-client.md). One job, kept light: from here on, a script error in this tab is
// counted on the server (src/components/report/error-reporter.ts).
import { installErrorReporter } from "@/components/report/error-reporter";

installErrorReporter();
