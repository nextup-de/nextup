# Operations docs

Running NextUp stacks: backups, releases, monitoring.

- [`RPO_RTO.md`](RPO_RTO.md): what a stack can lose (24 h) and how long a restore may take (1 h), and the restore steps.
- [`monitoring.md`](monitoring.md): health checks, alert recipients and the external heartbeat monitor.
- [`../../stack/remote/README.md`](../../stack/remote/README.md): a customer VM, one stack, released over ssh with `deploy-remote.sh`.
- [`../../stack/tests/README.md`](../../stack/tests/README.md): the container host the stack scripts are tested on, and the install rehearsal.
- [`../../stack/nginx/RUNBOOK.md`](../../stack/nginx/RUNBOOK.md): the shared Hetzner box: stacks, staging and release track, backups, health.
- [`../../stack/README.md`](../../stack/README.md): what a stack is, how to install it, backups, running on a customer server.
