# Setting up Microsoft Teams for NextUp (for your Microsoft 365 administrator)

> **Draft for Marc, 2026-11-11.** Not sent to a customer before Marc has read it. Plan S, issue #663 (Q9.3).
> **Not yet tested end to end:** the install by setup policy needs one live test in a customer-like tenant before this
> goes to a customer. Until then the fallback in step 6 applies.

About thirty minutes in the Azure portal and the Teams admin center, after Microsoft sign-in is set up
([ENTRA_SETUP.md](ENTRA_SETUP.md)). When you are done, your people get NextUp's notices as cards in Teams and can answer
and raise from there. What Teams does in NextUp: [`docs/TEAMS.md`](../TEAMS.md).

> Internal note: send it with the company's address (`https://<company>.sellux.ch`) and the company slug filled in.

## What NextUp can and cannot see

The bot talks to a person 1:1 only. It reads what a person sends to it or puts in the NextUp form, and nothing else:
no chats, channels, files or calendars. It runs in **your** tenant, under the app registration you already made for
sign-in. If Teams is off, everyone gets mail as before.

## What you do

### 1. Create the bot in your tenant

Azure portal → **Create a resource → Azure Bot**.

- Type of App: **Single Tenant**
- Creation type: **Use existing app registration**, the `NextUp` registration from ENTRA_SETUP.md. Its Application
  (client) ID becomes the bot's Microsoft App ID.
- In the registration, **Certificates & secrets → New client secret** for the bot, with its own description (for
  example `NextUp Teams bot`). Note the expiry date: when it expires, cards stop and mail takes over.

### 2. Endpoint and channel

- Bot → **Configuration → Messaging endpoint:** `https://<company>.sellux.ch/api/<company>/teams/messages`
- Bot → **Channels → Microsoft Teams**, accept, save.

### 3. Send us

Through the channel we agreed on, by a one-time link, never by plain email:

- the Microsoft App ID
- the Directory (tenant) ID
- the bot's client secret

NextUp installs them on your stack. On your own server your IT does it with the same command
([`ops/teams/README.md`](../../ops/teams/README.md), step 4).

### 4. Switch Teams on

A company admin in NextUp: **Settings → Microsoft Teams**, switch it on, and **Download the app package**.

### 5. Install the app for the NextUp group

In the **Teams admin center**:

1. **Teams apps → Manage apps → Upload new app**, upload the package. It is now in your organisation's catalog.
2. **Teams apps → Setup policies**: add NextUp under *Installed apps* of a policy, and assign that policy to the group
   that uses NextUp (the same group as in Entra). A new policy can take a few hours to reach everyone.

Your people do not need to look for the app or say hello to the bot: once it is installed, the bot can write to them.

### 6. Test

A company admin presses **Send me a test card** on Settings → Microsoft Teams. The card arrives in their Teams chat
with NextUp.

**Fallback while the setup policy is untested:** a person who gets no card opens NextUp in Teams and says hello to the
bot once. Until then they get mail; nothing is lost.

## If something does not work

| What you see | Usually |
|---|---|
| "You have no chat with the bot yet" after **Send me a test card** | the app is not installed for that person yet (the policy has not reached them), or the bot did not get to write first: say hello once (step 6) |
| "Teams cannot be switched on yet: this stack has no bot registration" | NextUp has not installed the three values from step 3 yet |
| "Teams cannot be switched on yet: this company has no Microsoft tenant id" | the company's tenant ID is not set yet; NextUp sets it with the sign-in values |
| Cards stopped after months | the bot's client secret expired: make a new one and send it as in step 3 |
