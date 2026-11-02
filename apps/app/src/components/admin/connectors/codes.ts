// A refusal code of the console actions -> the catalog key that says it.
import type { MessageKey } from "@/i18n";
import type { ConsoleConnectorCode } from "@/server/actions/console-connectors";

export const CODE_KEY: Record<ConsoleConnectorCode, MessageKey> = {
  "not-allowed": "adminConnectors.errNotAllowed",
  "support-read-only": "adminConnectors.errSupportReadOnly",
  invalid: "adminConnectors.errInvalid",
  "no-vault": "adminConnectors.errNoVault",
  "no-token": "adminConnectors.errNoToken",
  "not-saved": "adminConnectors.errNotSaved",
  "not-configured": "adminConnectors.errNotConfigured",
  "switch-on-first": "adminConnectors.errSwitchOnFirst",
};
