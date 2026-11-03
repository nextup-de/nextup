"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { profileOf } from "@/features/demo/profiles";
import { personHref } from "@/features/people/links";
import styles from "./ProfileView.module.css";
import { M365Card } from "./M365Card";
import { NotifySettings } from "./NotifySettings";
import type { M365Card as M365CardData } from "@/server/m365-profile";
import { avatarTone } from "@/lib/avatar";
import { setLocale } from "@/i18n/actions";
import { useLocale, useT } from "@/i18n/client";
import { LOCALES, type Locale, type MessageKey } from "@/i18n";

type WorkKind = "ideaRaised" | "problemRaised" | "collaboration" | "idea";
const WORK_LABEL: Record<WorkKind, MessageKey> = {
  ideaRaised: "profile.typeIdeaRaised",
  problemRaised: "profile.typeProblemRaised",
  collaboration: "profile.typeCollaboration",
  idea: "profile.typeIdea",
};
const CASE_STATUS: Record<string, MessageKey> = {
  open: "profile.statusWaiting",
  discussion: "profile.statusDiscussion",
  decided: "profile.statusDecided",
  asked: "profile.statusAsked",
  building: "profile.statusBuilding",
  shipped: "profile.statusShipped",
};
// Each language is named in its own language, so these are never translated.
const LANGUAGE_KEY: Record<Locale, MessageKey> = { de: "profile.languageGerman", en: "profile.languageEnglish" };

const initials = (name: string) => name.split(/[.\s]+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export function ProfileView({ m365, mailPrefs }: { m365?: M365CardData | null; mailPrefs?: { template: string; on: boolean }[] | null }) {
  const ctx = useDemo();
  const t = useT();
  const { D, seed, persona, tenant, href } = ctx;
  const name = persona.who.name;
  const org = seed.people.find((p) => p.name === name);
  const role = org?.role ?? persona.role.label;
  const deptId = org?.dept ?? persona.role.dept;
  const dept = seed.depts.find((d) => d.id === deptId)?.name ?? deptId;
  const email = ctx.email ?? (tenant.demoTools ? profileOf(name).email : null);
  const location = tenant.demoTools ? profileOf(name).location : null;
  const anonymous = ctx.actor !== name;

  // A public profile only shows attributed work. Anonymous submissions never get joined to a person.
  const ideas = D.ideas.filter((i) => i.proposedBy.split(",")[0].trim() === name || i.team.includes(name));
  const initiatives = D.initiatives.filter((i) => i.members.some((m) => m.name === name));
  const cases = D.cases.filter((c) => ctx.actorUserId !== null && c.fromUserId === ctx.actorUserId);
  const ideaCount = ideas.length + cases.filter((c) => c.kind === "idea" && !c.linkedIdea).length;
  const manager = org?.reportsTo && org.reportsTo !== name ? seed.people.find((p) => p.name === org.reportsTo) : null;
  // A colleague is listed only when their seat belongs to a user with a person page (personLinks).
  const linkOf = (personName: string) => { const userId = seed.seats.find((s) => s.label === personName)?.userId; return userId ? personHref(tenant, userId) : null; };
  const colleagues = seed.people.filter((p) => p.name !== name && p.name !== manager?.name && p.dept === deptId && linkOf(p.name)).slice(0, 4);
  const work = [
    ...(cases.map((c) => ({ id: c.id, title: c.title, type: (c.kind === "idea" ? "ideaRaised" : "problemRaised") as WorkKind, status: CASE_STATUS[c.status] ? t(CASE_STATUS[c.status]) : c.status[0].toUpperCase() + c.status.slice(1), href: href("/cases/" + encodeURIComponent(c.id)) }))),
    ...initiatives.map((i) => ({ id: i.id, title: i.name, type: "collaboration" as WorkKind, status: i.status, href: href("/collaboration?id=" + encodeURIComponent(i.id)) })),
    ...ideas.map((i) => ({ id: i.id, title: i.title, type: "idea" as WorkKind, status: i.status, href: href("/ideas?id=" + encodeURIComponent(i.id)) })),
  ].slice(0, 6);

  return <div className={styles.page}>
    <div className={styles.pageHead}><div><Link href={href("/overview")} className={styles.back}>{t("profile.backOverview")}</Link><h1>{t("profile.myProfile")}</h1></div><span className={styles.company}>{tenant.name}</span></div>

    <section className={styles.hero} aria-labelledby="profile-name">
      <div className={styles.identity}>
        <span className={styles.avatar} data-avatar={avatarTone(name)} aria-hidden="true">{initials(name)}</span>
        <div className={styles.identityText}><div className={styles.nameLine}><h2 id="profile-name">{name}</h2><span className={styles.you}>{t("profile.you")}</span></div><p>{role}{dept ? " · " + dept : ""}</p><span className={styles.affiliation}>{[location, tenant.name].filter(Boolean).join(" · ")}</span></div>
        <Link className={styles.contact} href={href(ctx.role === "member" ? "/team" : "/leader")}>{ctx.role === "member" ? t("profile.myCases") : t("profile.openInbox")}<span aria-hidden="true">→</span></Link>
      </div>
    </section>

    <section className={styles.stats} aria-label={t("profile.statsLabel")}><div><strong>{cases.length}</strong><span>{t("profile.casesYouRaised")}</span></div><div><strong>{ideaCount}</strong><span>{t("profile.ideas")}</span></div><div><strong>{initiatives.length}</strong><span>{t("profile.collaborations")}</span></div></section>

    <div className={styles.columns}>
      <div className={styles.mainColumn}>
        {anonymous && <section className={styles.privacy}><span className={styles.privacyIcon} aria-hidden="true">◎</span><div><h2>{t("profile.howSeen")}</h2><p>{t("profile.seenAs")} <strong>{ctx.actor}</strong>. {t("profile.seenHidden")}</p></div></section>}

        <section className={styles.card}><div className={styles.sectionHead}><h2>{t("profile.yourWork")}</h2><span className={styles.count}>{work.length}</span></div>
          {work.length ? <div className={styles.workList}>{work.map((item) => <Link className={styles.workItem} href={item.href} key={item.type + item.id}><span className={styles.workIcon}>{item.type === "problemRaised" ? "P" : item.type === "collaboration" ? "↗" : "✳"}</span><span className={styles.workText}><strong>{item.title}</strong><small>{t(WORK_LABEL[item.type])}</small></span><span className={styles.status}>{item.status}</span><span className={styles.arrow} aria-hidden="true">→</span></Link>)}</div> : <div className={styles.empty}>{t("profile.noWork")}</div>}
        </section>

        <Link href={href("/team")} className={styles.myCases}><span><strong>{t("profile.followSent")}</strong><small>{t("profile.followSentSub")}</small></span><span aria-hidden="true">→</span></Link>
      </div>

      <aside className={styles.sideColumn} aria-label={t("profile.detailsLabel")}>
        <section className={styles.card}><div className={styles.sectionHead}><h2>{t("profile.details")}</h2></div><dl className={styles.details}><div><dt>{t("profile.role")}</dt><dd>{role}</dd></div><div><dt>{t("profile.department")}</dt><dd>{dept || t("profile.notSpecified")}</dd></div>{location && <div><dt>{t("profile.location")}</dt><dd>{location}</dd></div>}{email && <div><dt>{t("profile.email")}</dt><dd><a href={"mailto:" + email}>{email}</a></dd></div>}</dl></section>
        <LanguageSwitch />
        {m365 ? <M365Card card={m365} /> : null}
        {mailPrefs ? <NotifySettings slug={tenant.slug} prefs={mailPrefs} /> : null}
        {(manager || colleagues.length > 0) && <section className={styles.card}><div className={styles.sectionHead}><h2>{t("profile.peopleNearby")}</h2></div>{manager && <PersonLink name={manager.name} subtitle={t("profile.reportsTo")} href={linkOf(manager.name)} />}{colleagues.map((p) => <PersonLink key={p.name} name={p.name} subtitle={p.role} href={linkOf(p.name)} />)}</section>}
      </aside>
    </div>
  </div>;
}

function PersonLink({ name, subtitle, href }: { name: string; subtitle: string; href: string | null }) {
  const { href: withPrefix } = useDemo();
  const body = <><span className={styles.personAvatar} data-avatar={avatarTone(name)}>{initials(name)}</span><span><strong>{name}</strong><small>{subtitle}</small></span></>;
  return href ? <Link href={withPrefix(href)} className={styles.person}>{body}<span className={styles.arrow} aria-hidden="true">→</span></Link> : <div className={styles.person}>{body}</div>;
}

/** The language of the app for this person: a cookie (and the profile when signed in), then a refresh. */
function LanguageSwitch() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const choose = (next: Locale) => {
    if (next === locale) return;
    setError(null);
    start(async () => {
      const res = await setLocale(next);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };
  return <section className={styles.card} aria-labelledby="profile-language">
    <div className={styles.sectionHead}><h2 id="profile-language">{t("profile.language")}</h2></div>
    <div role="radiogroup" aria-labelledby="profile-language" className={styles.languages}>
      {LOCALES.map((l) => <button key={l} type="button" role="radio" lang={l} aria-checked={l === locale} disabled={pending} className={l === locale ? "nh-btn nh-btn-primary" : "nh-btn"} onClick={() => choose(l)}>{t(LANGUAGE_KEY[l])}</button>)}
    </div>
    {error ? <p className="nh-error" role="alert">{error}</p> : null}
  </section>;
}
