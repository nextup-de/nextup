# stack/provision/ — company stacks started from admin.sellux.ch

admin.sellux.ch (the private repo `selluxhenner/nextup-admin`, page **Companies**) can start,
stop and delete company stacks on the box. admin never touches Docker itself. It queues a job,
and the agent here picks it up:

```
admin.sellux.ch ──(queues a job)──▶ its database
        ▲                                 │
        │ POST /api/provision/jobs/<id>   │ GET /api/provision/next    (loopback only, once a minute)
        └──────────── agent.sh (cron, kschmid) ◀──┘
                         │
                         ├─ install.sh / add-stack.sh / remove-stack.sh   (as kschmid)
                         └─ sudo -n /usr/local/sbin/nextup-site add|remove  (nginx + certbot, root)
```

| File | What it is |
|---|---|
| `agent.sh` | The agent. Allowed jobs: `create`, `credentials`, `restart`, `stop`, `purge`, `promote`. It checks every value itself: the slug pattern and the reserved list, and the port against ports.md, every `instances/*/stack.conf` and `ss -tln`. It also needs at least 600 MB of free memory before a create, and it deletes demo stacks only. |
| `nextup-site.sh` | The only thing the agent may run as root. Install a **root-owned copy** to `/usr/local/sbin/nextup-site`; never point sudoers at this folder, because kschmid owns it and every deploy replaces it. |

## Picking the demo's version (`promote`)

admin's **Version** card on a pinned stack (today only `demo`, the interview stack) queues a
`promote` job with `slug` and `sha`. The agent:

1. accepts it only for a stack the box has pinned (`PINNED=` in its stack.conf), reserved slug or
   not - every other stack follows its track (stack/nginx/RUNBOOK.md, "Staging and the release track");
2. accepts only a sha in `~/nextup/staged` or `~/nextup/released`, never one that skipped staging;
3. runs `stack/nginx/deploy.sh promote <slug> <sha>`: pull, backup, that commit's `stack/`, pin, start;
4. checks `/api/health` and reports the log (codes scrubbed) with the "to go back" line.

For the card to show, the stack needs a company page: **Companies → Register a stack that already
runs** with `demo` (3121), and the same for `staging` (3991) to switch its feature flags there.
The agent reads their passwords (`credentials`) even though both slugs are reserved; it never
creates, stops or deletes a reserved stack.

To offer the choices, every poll's `X-Agent-Info` header also carries `released=` (the last ten
released shas, newest first), `staged=` (the newest staged sha) and `pins=` (`slug:sha` per pinned
stack). An admin that sees no `pins=` is talking to an older agent and should not offer the card.

A stack created from admin is registered in `~/nextup/instances/<slug>/stack.conf` (`PORT`,
`STAGE`, and `STOPPED=true` after a stop). This file lives outside `~/nextup/stack`, which every
deploy replaces. `add-stack.sh` accepts a slug when either ports.md or its stack.conf lists it.
`deploy.sh` redeploys those stacks as well, but not stopped ones.

## Install (once, on the box)

In this order:

```bash
# 1. admin: vault key + the agent's token (nextup-admin deploy/admin.sh)
~/nextup/admin/admin.sh install        # adds OPS_VAULT_KEY if missing - copy it to the password manager
~/nextup/admin/admin.sh agent-token    # writes ~/nextup/provision/.env (mode 600) and admin's hash

# 2. Kevin: the nginx helper, root-owned, plus exactly one sudoers line
sudo install -o root -g root -m 755 ~/nextup/stack/provision/nextup-site.sh /usr/local/sbin/nextup-site
echo 'kschmid ALL=(root) NOPASSWD: /usr/local/sbin/nextup-site' | sudo tee /etc/sudoers.d/nextup-site
sudo chmod 440 /etc/sudoers.d/nextup-site && sudo visudo -cf /etc/sudoers.d/nextup-site

# 3. cron (crontab -e as kschmid). No flock around it: the agent locks itself.
* * * * * ~/nextup/stack/provision/agent.sh >> ~/nextup/provision/agent.log 2>&1
```

Then, in admin, go to **Companies → Register a stack that already runs** and register acme (3101) and globex
(3111). Their passwords move into the vault, and from then on you can stop and start them there.

Without step 2 everything still works, except nginx: a new company ends as **needs nginx**. Its
page shows the three sudo lines, the same ones `add-stack.sh` prints.

## Config: `~/nextup/provision/.env`

The agent reads this file line by line and never sources it.

| Key | Default | |
|---|---|---|
| `ADMIN_URL` | — | `http://127.0.0.1:3131`. Admin refuses calls that came through nginx. |
| `PROVISION_TOKEN` | — | `npa_…`; admin keeps only its sha256 (`PROVISION_TOKEN_SHA256`) |
| `OPS_PUBLIC_URL` | `https://admin.sellux.ch` | where new stacks send tickets |
| `NEXTUP_IMAGES` | `released` | image tag for new stacks: `released` (the last sha in `~/nextup/released`, so a new company gets what the others run; `main` until there is one), `main`, a 7-char sha, or `local` |
| `SITE_HELPER` | `/usr/local/sbin/nextup-site` | or `none` (laptop) |
| `MIN_MEM_MB` | `600` | refuse a new stack below this much MemAvailable |

## Try it on a laptop

The flow was tested end to end on 28 Sep 2026 with admin on :3132 and this agent in Git Bash:
create → read passwords → stop → start → delete.

```bash
# a scratch "box home" with provision/.env: ADMIN_URL=http://127.0.0.1:3132, NEXTUP_IMAGES=local,
# SITE_HELPER=none, MIN_MEM_MB=0, OPS_PUBLIC_URL=http://host.docker.internal:3132
NEXTUP_HOME=/path/to/scratch bash stack/provision/agent.sh
```
