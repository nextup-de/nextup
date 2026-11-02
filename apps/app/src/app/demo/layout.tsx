// The static demo (docs/IDEAS.md "The demo page"): NextUp on made-up data, for showing people how it
// works. No company, no login, no database. Lives at /demo, outside every company - or at the root of a
// stack that is the demo (demo.sellux.ch), which the proxy rewrites onto /demo.
//
//   (app)     the app itself, in the static demo's frame (components/demo/StaticDemo.tsx); pages that
//             should not start the demo over when they load go beside it, outside the frame

// Where the links point depends on the stack it runs on (env), not on the build.
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: { template: t("demo.titleTemplate"), default: t("demo.titleDefault") }, robots: { index: false } };
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
