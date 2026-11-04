# NextUp Teams app

The package Teams installs: `manifest.json`, `de.json` (German texts), `color.png` (192 x 192) and `outline.png`
(32 x 32). The settings page (`/<company>/settings/teams`) downloads it with the app id and host of the stack filled
in (`apps/app/src/server/teams/package.ts`). Redraw the icons with `node ops/teams/make-icons.mjs`.

## Register the bot in the test tenant (Kevin, once per stack)

1. Azure portal, **Azure Bot** -> Create. Type **Single tenant**, the test tenant. Note the **Microsoft App ID** and the
   **Tenant ID**; under *Manage Password* create a client secret.
2. Bot **Configuration** -> Messaging endpoint: `https://<host>/api/<company>/teams/messages`
   (the endpoint is TMS-E1; use the company slug of the stack).
3. Bot **Channels** -> add **Microsoft Teams**.
4. Put the three values in the stack's env: `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD` (the client secret) and
   `TEAMS_TENANT_ID`. Restart the app.
5. In NextUp as a company admin: Settings -> Microsoft Teams. The company needs its Microsoft tenant id
   (Settings -> Sign-in). Switch Teams on.
6. **Download the app package**. In Teams: Apps -> Manage your apps -> Upload an app -> *Upload a custom app*
   (sideloading must be allowed in the tenant admin center, or upload the zip there under *Teams apps ->
   Manage apps -> Upload new app*).
7. Open the app, say hello to the bot, then press **Send me a test card** on the settings page.
