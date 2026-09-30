# Port registry — the shared Hetzner box (178.104.253.90)

Every NextUp stack on the box gets a block of ten loopback ports. nginx proxies `SLUG.sellux.ch`
to the first one. `sellux.ch` and `www` go to the landing page, which also runs on this box (row `landing`; repo `nextup-landing`, `deploy/`). Nothing here is reachable from outside; only nginx (80/443) is public.

| Offset | Service |
|---|---|
| +0 | Caddy (plain http; nginx proxies here) |
| +1 | mailpit inbox (demo stage) |
| +2 | n8n editor (`--n8n`) |
| +9 | Caddy's unused 443 mapping |

Add a row **before** running `add-stack.sh`. It refuses a slug/port pair that isn't here.

| Slug | Port | Stage | Host | Notes |
|---|---|---|---|---|
| acme | 3101 | demo | acme.sellux.ch | seeded demo company |
| globex | 3111 | demo | globex.sellux.ch | empty; company created in /admin |
| demo | 3121 | demo | demo.sellux.ch | the interview stack: acme's demo data, **pinned** - deploys skip it, `deploy.sh promote demo <sha>` moves it (RUNBOOK, "The interview stack") |
| admin | 3131 | - | admin.sellux.ch | reserved: our developer tool, apps/ops (step 7); not a company stack |
| automation | 3141 | - | automation.sellux.ch | n8n for building/testing (step 8), `stack/automation/`. nginx basic auth + n8n's own login |
| landing | 3151 | - | sellux.ch, www | public site: one container from `nextup-landing` (`~/nextup/landing`, not a company stack) |

Ports the box's other sites use (don't take them): 3001-3038, 3306/3307, 3999, 25565. To check
what's in use: `ss -tln`.
