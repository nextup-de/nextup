// The frame of the setup process: the ground, a bar with the logo, the way out and who is signed in,
// and one narrow column. No app navigation and no settings menu: setup is its own process.
import Link from "next/link";
import { SITE } from "@/config/site";
import { Ground } from "@/components/shell/Ground";
import shell from "@/components/shell/SimpleShell.module.css";
import s from "./Setup.module.css";

type Props = { homeHref: string; leaveText: string; initials: string | null; children: React.ReactNode };

export function SetupFrame({ homeHref, leaveText, initials, children }: Props) {
  return (
    <div className={s.frame}>
      <Ground />
      <header className={s.bar}>
        <span className={shell.logo} role="img" aria-label={SITE.name} />
        <div className={s.barEnd}>
          <Link className={s.leave} href={homeHref} data-testid="setup-leave">{leaveText}</Link>
          {initials ? <span className={s.avatar} aria-hidden="true">{initials}</span> : null}
        </div>
      </header>
      <main className={s.column}>{children}</main>
    </div>
  );
}
