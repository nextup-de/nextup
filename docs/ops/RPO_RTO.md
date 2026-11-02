# RPO and RTO

What a customer stack can lose and how long a restore takes. `stack/backup.sh` is the tool;
`stack/tests/rpo-rto.test.sh` checks the numbers below.

```
RPO_HOURS=24
RTO_SECONDS=3600
```

## RPO: 24 hours

At most one day of data is lost. Two things make snapshots:

- `backup.sh all backup` runs nightly at 03:17 from cron.
- `backup.sh <slug> pre-migrate <sha>` runs before every release migrates the database. Those
  snapshots are tagged `<slug>-pre-migrate` and `release-<sha>`, not `<slug>`, so the nightly
  retention never prunes them; the last 10 are kept.

`health.sh` alerts when a stack's last backup is older than 26 hours.

A repository on the stack's own disk is not a backup against losing the machine. Production stacks
set `RESTIC_REPOSITORY` to an `s3:` target with `BACKUP_S3_ACCESS_KEY_ID` and
`BACKUP_S3_SECRET_ACCESS_KEY`, and `BACKUP_OFFBOX=required`, so `backup.sh` refuses a local repository.

## RTO: 1 hour

From the decision to restore until `/api/health` answers 200 again. `backup.sh <slug> restore-test`
restores the latest snapshot into a throwaway database (the `db` image of `stack/compose.yml`),
logs `seconds=<n>` and fails when `n` is over `RTO_SECONDS` (environment, default 3600). Cron runs
it weekly (Sunday 04:47, `backup.sh all restore-test`).

## What a snapshot holds

- the database dump (`pg_dump -Fc`),
- the stack's `.env` as `instance.env` (secrets included; the repository is encrypted),
- n8n's data volume, if the stack runs n8n.

## RESTIC_PASSWORD

Without `RESTIC_PASSWORD` no snapshot can be read. It is in the stack's `.env` on the host, and a copy
must live outside the host (password manager). A host that dies takes its `.env` with it.

## Restore

```bash
stack/backup.sh <slug> snapshots            # pick an id (add --json for scripts)
stack/backup.sh <slug> restore-test <id>    # optional: check it in a throwaway database
stack/backup.sh <slug> restore <id>         # REPLACES the live database; type the slug to confirm
curl -fs https://<host>/api/health          # done when this answers 200
```

On a new host, put the stack's `.env` back first (`instance.env` in the snapshot), start the stack,
then run `restore`.
