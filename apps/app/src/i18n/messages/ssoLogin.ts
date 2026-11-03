// The login page's single sign-on: the errors a refused sign-in shows (EID). One key per SsoError.
import { defineMessages } from "../define";

export const ssoLogin = defineMessages({
  en: {
    no_account: "Nobody at {company} has this email.",
    several_accounts: "More than one account at {company} has this email. Ask your admin.",
    inactive: "This account is no longer active at {company}.",
    not_on: "Single sign-on is not switched on for {company}.",
    demo_company: "Single sign-on is not available for a demo company.",
    invalid_response: "The sign-in answer could not be checked. Try again.",
    replayed: "This sign-in was already used. Start again.",
    encrypted_assertion: "Encrypted sign-in answers are not supported. Ask your admin.",
    email_unverified: "Your email is not verified at your sign-in provider.",
    expired_flow: "The sign-in took too long. Start again.",
  },
  de: {
    no_account: "Bei {company} hat niemand diese E-Mail.",
    several_accounts: "Bei {company} haben mehrere Konten diese E-Mail. Fragen Sie Ihre Admin-Person.",
    inactive: "Dieses Konto ist bei {company} nicht mehr aktiv.",
    not_on: "Die Einmalanmeldung ist für {company} nicht eingeschaltet.",
    demo_company: "Die Einmalanmeldung gibt es für eine Demo-Firma nicht.",
    invalid_response: "Die Antwort der Anmeldung konnte nicht geprüft werden. Versuchen Sie es noch einmal.",
    replayed: "Diese Anmeldung wurde schon verwendet. Beginnen Sie neu.",
    encrypted_assertion: "Verschlüsselte Anmelde-Antworten werden nicht unterstützt. Fragen Sie Ihre Admin-Person.",
    email_unverified: "Ihre E-Mail ist bei Ihrem Anmeldedienst nicht bestätigt.",
    expired_flow: "Die Anmeldung hat zu lange gedauert. Beginnen Sie neu.",
  },
});
