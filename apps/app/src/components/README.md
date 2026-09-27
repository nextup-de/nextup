# components

React only. Receive view models as props, render, emit events. No data fetching, no direct feature calls except pure helpers.

- `ui/` primitives (Button, Field, Divider) on top of the global nh-* classes
- `marketing/` public site sections
- `auth/` AuthShell + form pieces for the login flow
- `shell/` the authenticated chrome (rail, top bar; input sheet + dev panel to come)
- `dashboard/{manager,leader,team,shared}` role views (Phase 2-3)
