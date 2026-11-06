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
4. Give the stack the three values through its install path, on the server, as the deploy user. The client
   secret comes from the environment, never from the command line:
   ```bash
   read -rs NEXTUP_TEAMS_APP_PASSWORD && export NEXTUP_TEAMS_APP_PASSWORD
   stack/install.sh --slug <company> --origin https://<host> --teams-app-id <Microsoft App ID> --teams-tenant-id <Tenant ID>
   ```
   This works on a new and on an existing instance. It writes `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD` and
   `TEAMS_TENANT_ID` to the instance's `.env` (`stack/instances/<company>/.env`, or `$NEXTUP_INSTANCES/<company>/.env`;
   a second run replaces them), `stack/compose.yml` hands them to the app, and the install restarts the app with them.
   If you edit the `.env` by hand instead, run `stack/ctl.sh <company> up -d` afterwards: a plain restart does not
   read the file again.
5. In NextUp as a company admin: Settings -> Microsoft Teams. The company needs its Microsoft tenant id
   (Settings -> Sign-in). Switch Teams on.
6. **Download the app package**. In Teams: Apps -> Manage your apps -> Upload an app -> *Upload a custom app*
   (sideloading must be allowed in the tenant admin center, or upload the zip there under *Teams apps ->
   Manage apps -> Upload new app*).
7. Open the app, say hello to the bot, then press **Send me a test card** on the settings page.
