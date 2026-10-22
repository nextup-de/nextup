# NextUp app - UI kit

Click-through recreation of the signed-in NextUp web app (`apps/app` in nextup-de/nextup). Open `index.html`.

Flow: **Login** → **Ideas** (Raise: type and press Enter for Evaluating; or open a draft to see the coach chat with its turn rail) → **Inbox** (pick a row → avatar rail, idea, five gauges, Your decision, From the feed) → **Feed** (Open/Archive, departments, Support; a card opens Projects) → **Projects** (step track, desk strip, Idea / AI tabs, thread with the team lead). Profile → **What I sent**.

| File | Recreates | Source |
|---|---|---|
| LoginScreen.jsx | AuthShell art="hand" + FindCompanyForm | components/auth/AuthShell.*, app/(auth)/login/page.tsx |
| RaiseScreen.jsx | Raise sidebar, start, composer, chat + Evaluating | components/ideas/Raise*.tsx, Raise.module.css |
| InboxScreen.jsx | "Fresh ideas" card, stats head, rows, docked list | components/dashboard/leader/InboxView.* |
| FeedScreen.jsx | Feed head, toggles, chips, cover cards | components/dashboard/team/FeedView.tsx, Feed.module.css |
| SentScreen.jsx | What happened to what I sent | components/dashboard/team/SentView.* |
| App.jsx | SimpleShell bar, profile popover, toast | components/shell/SimpleShell.* |
| kit.css | screen layouts (values copied from the *.module.css) | |

Simplified / not recreated:
- Score reasoning (the chevron drop-down) is a one-line stand-in; sources/attachments sections are omitted.
- Projects list/board (ProjectBoard) is not recreated - only the single-idea view.
- The Evaluating orb (`EvalOrb`) is omitted; the chat reply text is illustrative.
- Overview, Dashboard (manager), Projects, Collaboration, admin are not recreated.
