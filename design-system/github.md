repo: nextup-de/nextup
branch: main
path: apps/app

## Last sync
date: 2026-10-22T15:36:16Z

### Updated in this project
- Whole system moved to the new look (Inter, system greys, black pills); Manrope/greige retired
- Added system components: gauges, step track, decision list, panels, chat
- App kit: opened Inbox idea, Projects idea view, coach chat rail
- Logo set replaced with the team's supplied files

## Screen map
| Project screen | Repo files |
|---|---|
| tokens/*.css, styles/primitives.css | apps/app/src/styles/tokens.css, apps/app/src/app/globals.css, apps/app/src/app/layout.tsx |
| styles/dashboard.css, components/dashboard/* | apps/app/src/components/dashboard/shared/ui.module.css, primitives.tsx, team/SentView.module.css |
| components/core/* | apps/app/src/components/ui/Button.tsx, Field.tsx, Divider.tsx, Skeleton.tsx |
| components/icons/Icon.jsx | apps/app/src/components/ideas/raiseIcons.tsx |
| components/shell/*, styles/shell.css | apps/app/src/components/shell/SimpleShell.*, Ground.* |
| components/ideas/RaiseComposer.jsx, styles/composer.css | apps/app/src/components/ideas/RaiseComposer.tsx, Raise.module.css |
| ui_kits/app/LoginScreen.jsx | apps/app/src/components/auth/AuthShell.*, forms.module.css, FindCompanyForm.tsx, app/(auth)/login/page.tsx |
| ui_kits/app/RaiseScreen.jsx | apps/app/src/components/ideas/RaiseStart.tsx, RaisePrompts.tsx, Raise.module.css |
| ui_kits/app/InboxScreen.jsx | apps/app/src/components/dashboard/leader/InboxView.tsx, InboxView.module.css |
| ui_kits/app/FeedScreen.jsx | apps/app/src/components/dashboard/team/FeedView.tsx, Feed.module.css |
| ui_kits/app/SentScreen.jsx | apps/app/src/components/dashboard/team/SentView.tsx, SentView.module.css |
| tokens/system.css, styles/system.css, components/system/* | apps/app/src/components/dashboard/leader/IdeaDetail.module.css, IdeaDetail.tsx, IdeaParts.tsx, team/Overview.module.css, team/OverviewIdea.tsx |
| ui_kits/app/ProjectScreen.jsx | apps/app/src/components/dashboard/team/OverviewIdea.tsx, OverviewChats.tsx, Overview.module.css |
