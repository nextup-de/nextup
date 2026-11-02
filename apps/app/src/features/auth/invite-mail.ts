// The mail a new member gets: their personal login code and where to type it. Pure - the caller
// passes the company's login address and the recipient's language. The code is in the body only;
// the address never carries it, so a mail scanner or a browser history cannot leak a sign-in.
import { translate, type Locale } from "@/i18n";

export type InviteMail = { subject: string; text: string };

export function inviteMail(
  person: { name: string },
  company: { name: string; loginUrl: string },
  code: string,
  locale: Locale,
): InviteMail {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  return {
    subject: t("settings.inviteMailSubject", { company: company.name }),
    text: [
      t("settings.inviteMailHello", { name: person.name }),
      "",
      t("settings.inviteMailIntro", { company: company.name }),
      "",
      t("settings.inviteMailCode", { code }),
      t("settings.inviteMailLogin", { url: company.loginUrl }),
      "",
      t("settings.inviteMailKeep"),
    ].join("\n"),
  };
}
