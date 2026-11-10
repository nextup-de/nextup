# Shop-floor access (plan FLR)

People on the floor raise a problem or an idea from a phone without a NextUp account, and read the answer later.
Roles, not people: no page counts cases per person, device or area, and a floor case goes to a seat of the area's
role, never to a person the raiser picks.

## What an admin sets up

Everything is under Settings (company admins only).

- **Areas** (`/<slug>/settings/areas`): an area has a name, a short key (`line-3`), a unit, a role and an
  "anonymous" switch. It can be paused. The page lists areas and devices, never how many cases came from them.
- **Posters** (`/<slug>/settings/areas/<key>/poster`): a printable A4 or A5 sheet with the area's QR code and the URL
  `<base>/<slug>/floor/<key>` under it, in German, English or both.
- **Devices** (`/<slug>/settings/areas/devices`): shared phones or tablets are paired with a pairing code.
- **Floor codes**: six digits, issued by an admin for one member, shown once, replacing that member's previous
  code. Issuing is audited as `audit.settings.areas`.

## What a floor user sees

Phone pages with no app shell and no session, light theme, targets of at least 48 px (main buttons 64 px), a DE | EN
switch.

1. Scan the poster: `floor/<key>`. Pick problem or idea, write a title (1-120) and optionally a detail (0-2000), send.
2. `floor/sent` shows the reference once, with a printable slip whose QR opens the status page.
3. `floor/status`: enter the reference on the keypad (or scan the slip). The page shows the title, the area, the
   step (sent, read, asked, decided, handed), the title of the role that holds the case, and for a decision the
   answer and the reason the desk picked (never its free-text comment or a name). When the desk asked a question, one reply field appears (1-1000 chars; one reply per question).
4. Signing in with a floor code (`floor/<key>/sign-in`) raises the case under the member's name; this is needed where
   the area does not allow anonymous raises.

## Limits (D11)

- A floor code or device is not a NextUp session; it opens nothing outside `/<slug>/floor`.
- The floor code cookie lasts 2 minutes and is cleared by the next send. A wrong code and a deactivated user get the
  same message.
- The status page never shows a person's name, handle, comment, or who raised the case.
- A role without holders cannot receive a floor case: the raise is refused as vacant and nothing is written.
- Raises and lookups are rate limited.

## The reference (D8)

- Eight random digits, unique per company, stored only as a hash.
- Shown once on `floor/sent` and on the slip. It travels from the raise action to the sent page in a signed httpOnly
  cookie (`nextup_floor_sent`, 120 s, path `/<slug>/floor`) that the page deletes.
- It is never in a URL path or query. The slip's QR is `<base>/<slug>/floor/status#<reference>`; the fragment never
  reaches the server, the page reads it in the browser, posts it, and wipes it from the address bar.
- Proof: `apps/app/tests/e2e/db/shop-floor.spec.ts` records every request URL of the phone and checks that none
  contains the reference.

## Not built

- **Offline queueing.** Without a connection the form says so and keeps the text in the page; nothing is queued or
  sent later. Nothing is stored on a shared device.
