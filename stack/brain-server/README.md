# stack/brain-server — the AI on its own server

The brain (`services/brain`) and its model need about 8 GB of memory. The shared box has none to
spare, so they run on a second server and the stacks call them over a private network.

```
server 1: the stacks                         server 2: the AI (this folder)
  acme, demo, ... app  ── BRAIN_URL + key ──▶  brain ──▶ ollama + mistral-nemo
  no brain, no ollama      private network     only on 10.x:8000   no ports
```

- **One brain, several stacks.** The brain stores nothing and knows no company; every request
  brings what it needs. All stacks that use it share one key, so this is for demo stacks. A real
  company gets a brain of its own (`install.sh --brain`, or a server like this one just for it).
- **Not reachable from the internet.** The brain listens only on the private address, Ollama on
  none. The private network is not encrypted; both servers are ours and in the same network zone.
- **Nothing to back up.** The only state is the downloaded model and the key in `~/nextup/brain/.env`.

## Set it up

1. **Hetzner console → Networks → Create network**: name `nextup`, zone `eu-central`, range
   `10.77.0.0/16`. Attach server 1 to it (Networks → the network → Attach server; no restart, it
   gets an address like `10.77.0.2`).
2. **Create the server**: Nuremberg or Falkenstein, Ubuntu 24.04, 8 vCPUs and 16 GB RAM, your SSH
   key, network `nextup`. A firewall with one inbound rule, TCP 22, is enough.
3. **On the new server:**

```bash
git clone --depth 1 https://github.com/nextup-de/nextup.git ~/nextup-src
~/nextup-src/stack/brain-server/brain-server.sh install   # Docker, the brain, the model (~7 GB)
~/nextup-src/stack/brain-server/brain-server.sh test      # one routing and one coach answer, with the seconds
```

`install` finds the server's private address by itself and refuses a public one. `--model NAME`
picks another model; `--bind 127.0.0.1` tries it on the machine alone, before there is a network.

## Connect a stack

On server 1, with the URL from `brain-server.sh url` and the key from `brain-server.sh key`:

```bash
~/nextup/stack/nginx/set-brain.sh acme http://10.77.0.3:8000   # asks for the key (not echoed)
~/nextup/stack/nginx/set-brain.sh acme --off                   # back to keyword router and offline coach
```

It changes nothing unless the AI server answers and accepts the key. A stack that ran its own
brain loses the `brain` profile and its two containers. Its model stays on disk until you remove it:

```bash
docker volume rm nextup-acme_ollamadata && docker image rm ollama/ollama:latest nextup-brain:local
```

The pinned interview stack (`demo`) is connected the same way, but it only uses the coach once it
is promoted to a commit that has it.

## After a brain PR

CI does not build the brain. After a merge that touches `services/brain`, on server 2:

```bash
~/nextup-src/stack/brain-server/brain-server.sh update   # pull main, rebuild, restart the brain
```

An app that is newer than the brain gets a 404 for an endpoint the brain does not have yet and
falls back, as it does when the brain is off.

## Day to day

```bash
brain-server.sh ps
brain-server.sh logs -f brain      # one line per answer: rows, point, ms - never the idea text
brain-server.sh logs -f ollama
brain-server.sh up -d              # after a restart where the brain did not come back
```

**Speed.** On CPUs alone expect tens of seconds per answer. The app waits `BRAIN_TIMEOUT_MS`
(30 s) and then falls back, so measure with `test` before showing it. A GPU brings it to seconds.
