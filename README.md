# cmux-persistent-ssh

bulletproof persistent terminal sessions using [cmux](https://cmux.dev) + [eternal terminal](https://eternalterminal.dev) + [zellij](https://zellij.dev).

every cmux tab remembers its session. close your laptop, switch wifi, reboot — your terminal is exactly where you left it.

## what it does

- **`.`** — connects to your server via eternal terminal, auto-attaches to a zellij session named after your cmux workspace + tab position
- **`,`** — same session naming but runs zellij locally
- **`..`** — plain ET connection, no zellij
- **auto-cleanup** — purges dead zellij sessions older than 7 days on every connect
- **cmux-aware naming** — tab 2 in workspace "mcp-ga4" always gets session `mcp-ga4-t2`. close the tab, reopen it in the same position, type `.` — you're back in the exact same session.

## how it works

```
you type "."
  → reads cmux workspace name + tab position
  → derives session name: "mcp-ga4-t1"
  → opens ET connection with 5s keepalive
  → attaches to zellij session "mcp-ga4-t1" (creates if new)

network drops?
  → ET silently reconnects
  → zellij session stays alive on server
  → you're back where you left off
```

three layers of persistence, each backing up the last:

| layer | what it does | tolerance |
|-------|-------------|-----------|
| SSH keepalive | server pings client every 60s | survives 2hr idle |
| ET keepalive | client heartbeat every 5s, auto-reconnect | survives network changes, sleep/wake |
| zellij session | terminal state lives on server | survives everything — session is immortal until you kill it |

## install

```sh
npx cmux-persistent-ssh
```

the interactive wizard will:

1. install eternal terminal and zellij via homebrew (if needed)
2. configure ET keepalive (`~/.et`)
3. add SSH keepalive tuning for your remote host (`~/.ssh/config`)
4. inject shell functions into `~/.zshrc` (safely, between marker comments)
5. generate a server optimization script for your remote machine

## prerequisites

- **macOS** — this tool is macOS-only (client side)
- **[homebrew](https://brew.sh)** — used to install ET and zellij
- **[cmux](https://cmux.dev)** — optional but recommended. without it, sessions fall back to `unnamed-t1`
- a remote server with `etserver` running (macOS or linux)

## server setup

after running the wizard, it generates `~/cmux-persist-server-setup.sh`. copy it to your server and run it:

```sh
scp ~/cmux-persist-server-setup.sh myhost:~/
ssh myhost 'bash ~/cmux-persist-server-setup.sh'
```

this tunes (all idempotent, safe to re-run):

- **sshd** — `ClientAliveInterval=60`, `ClientAliveCountMax=120`, `TCPKeepAlive=yes`
- **ET daemon** — `KeepAlive=true` in launchd/systemd (auto-restart on crash)
- **macOS power** — `sleep=0`, `powernap=0`, `tcpkeepalive=1`, `womp=1`
- **TCP sysctls** — `keepidle=600s`, `keepintvl=30s`, `keepcnt=15`, `always_keepalive=1`

## usage

| shortcut | what it does |
|----------|-------------|
| `.` | ET + zellij to your configured host |
| `,` | local zellij (same cmux-aware session naming) |
| `..` | plain ET, no zellij |

### session naming

sessions are named `{workspace}-t{tab_position}`:

```
cmux workspace "mcp-ga4"
├── tab 1  →  zellij session "mcp-ga4-t1"
├── tab 2  →  zellij session "mcp-ga4-t2"
└── tab 3  →  zellij session "mcp-ga4-t3"

cmux workspace "wegent"
└── tab 1  →  zellij session "wegent-t1"
```

the name is derived from your cmux workspace name and the tab's visual position. if you close a tab, open a new one in the same position, and type `.` — you reconnect to the same zellij session. no UUIDs, no config, no thinking.

without cmux, sessions fall back to `unnamed-t1`.

## re-running / updating

the wizard is fully idempotent. run it again to:

- skip already-installed dependencies
- update shell functions in place (detected by marker comments)
- back up your files before any modification (keeps last 3 backups)

it will never duplicate entries or break your existing config.

## other commands

```sh
# check what's installed and configured (read-only, no changes)
npx cmux-persistent-ssh --check

# remove shell functions from ~/.zshrc
npx cmux-persistent-ssh --uninstall
```

## heads up

the `.` function overrides the POSIX `source` builtin (`. file.sh`). in practice this is fine — zsh uses `source` for sourcing, and `.` as a command is rarely used directly. if you rely on `. some_file.sh` syntax, use `source some_file.sh` instead.

## how it actually persists

```
your mac                              your server
┌─────────────┐      ET tunnel      ┌────────────────────┐
│ cmux tab     │ ◄─────5s ping────► │ zellij session     │
│              │                     │ "mcp-ga4-t1"       │
│ .() function │ ◄──SSH 60s alive──► │                    │
│              │                     │ your processes,    │
│ derives name │                     │ scroll buffer,     │
│ from cmux    │                     │ everything — alive │
└─────────────┘                     └────────────────────┘

wifi drops → ET reconnects in <5s → zellij session untouched
laptop sleeps → ET reconnects on wake → same session
server reboots → ET reconnects → zellij starts fresh (but that's what reboots do)
```

## troubleshooting

**"unnamed-t1" as session name** — cmux is not installed or you're not in a cmux terminal. install cmux from https://cmux.dev or use a named session manually.

**ET connection refused** — make sure `etserver` is running on your server (`brew services start et` on macOS, `systemctl start etserver` on linux).

**session not resuming after reconnect** — check that zellij is installed on the server (`zellij --version`). ET reconnects the tunnel, but zellij needs to be there to hold your session.

**cleanup not working** — the cleanup runs in the background and only targets sessions marked `EXITED` that are 7+ days old. check manually: `ssh yourhost 'zellij list-sessions'`.

## license

MIT
