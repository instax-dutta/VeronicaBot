# VeronicaBot

> Privacy-first Discord bot for real‑time YouTube & Twitch live notifications.  
> **Self‑hosted. Zero telemetry. No cloud lock‑in.**

[![Version](https://img.shields.io/github/package-json/v/instax-dutta/VeronicaBot?label=version&color=5865F2)](https://github.com/instax-dutta/VeronicaBot/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](package.json)
[![Discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord)](https://discord.js.org)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker)](Dockerfile)

---

## Why VeronicaBot?

Most notification bots send your data to third‑party clouds or charge per server.  
VeronicaBot is **different by design**:

| Yours | Theirs |
|-------|--------|
| **Local SQLite** – all data on your machine | Cloud databases you don't control |
| **No telemetry** – zero analytics, no pings home | Built‑in tracking & user profiling |
| **Self‑hosted** – your server, your rules | Vendor lock‑in, paid tiers, API limits |
| **Open source** – MIT, fully auditable | Closed source, trust‑based |
| **Minimal footprint** – runs on a $5 VPS | Heavy containers, hidden costs |

> **Bottom line:** You own the bot. Not us. Not a cloud provider. **You.**

---

## What It Does

- Monitors **YouTube** channels for live streams **and** video uploads
- Monitors **Twitch** streamers via **dual‑mode detection** (instant EventSub + polling fallback)
- Sends rich, beautifully formatted **Discord embeds** with thumbnails, game info, and viewer counts
- Pings **custom roles, @everyone, or @here** when creators go live
- Merges notifications when the same creator streams on **both platforms** simultaneously
- Works across **unlimited servers** from a single bot instance

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/instax-dutta/VeronicaBot.git
cd VeronicaBot

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env with your API keys (see Configuration section)

# 4. Launch
npm start
```

> ✅ Database auto‑creates on first run.  
> ✅ Commands auto‑register with Discord.  
> ✅ Slack commands work immediately — `/help` to verify.

📘 **Full walkthrough →** [Getting Started](#getting-started)

---

## At a Glance

```
┌─ VeronicaBot ─────────────────────────────────────────┐
│                                                        │
│  Discord  ─┐                                           │
│  YouTube  ─┤── Scheduler ── SQLite ── Rich Embeds      │
│  Twitch   ─┘                       (WebSocket+Polling)  │
│                                                        │
│  Express API (port 3001) ── Next.js Dashboard (opt.)   │
│  Redis Cache (optional)                                │
└────────────────────────────────────────────────────────┘
```

**Detection pipeline:**  
Scheduler → check API cooldowns → fetch live status → compare with DB → send notification → log + cache.

---

## Features

| Area | Capability |
|------|-----------|
| **YouTube** | RSS feed polling (free, no quota) + API verification for live/video detection |
| **Twitch** | Dual‑mode: EventSub WebSocket (instant) + Helix polling (1‑min fallback) |
| **Notifications** | Embed builder with platform colors, buttons (Watch/Chat/Clips), game info, viewercount |
| **Cross‑platform** | Same creator live on YouTube + Twitch? Bot **edits** a single embed to show both |
| **Role mentions** | Per‑creator role pings, @everyone, or @here — configurable per route |
| **Duplicate prevention** | Cooldowns, stream‑ID tracking, notification‑log dedup |
| **Slash commands** | `/add`, `/remove`, `/list`, `/status`, `/forcepoll`, `/help` |
| **Dashboard** | Optional Next.js web UI for managing creators, routes, and logs |
| **REST API** | Full CRUD over creators, routing, notifications — JWT‑authenticated |
| **Health monitoring** | Auto health checks every 10 min: DB, Redis, Discord, API quota |
| **Graceful shutdown** | SIGINT/SIGTERM handler drains scheduler, EventSub, API, DB cleanly |

---

## Getting Started

### Prerequisites

| Service | What you need | How to get it |
|---------|--------------|---------------|
| **Discord** | Bot token + Client ID | [Discord Developer Portal](https://discord.com/developers/applications) → New Application → Bot → Reset Token |
| **YouTube** | API key | [Google Cloud Console](https://console.cloud.google.com/) → Enable YouTube Data API v3 → Credentials → API Key |
| **Twitch** | Client ID + Secret | [Twitch Developer Console](https://dev.twitch.tv/console/apps) → Register Application |
| **Optional: Redis** | Upstash REST URL + Token | [Upstash](https://upstash.com) → Create Redis DB → REST API tab *(bot works fine without it)* |
| **Optional: Dashboard** | Discord OAuth2 Secret | Discord Developer Portal → OAuth2 → General → Client Secret |

Add the bot to your server using the OAuth2 URL generator with **`bot`** and **`applications.commands`** scopes.

### 5‑minute Setup

```bash
# 1. Environment
cp .env.example .env
# Fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, YOUTUBE_API_KEY,
# TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET

# 2. Install & run
npm install && npm start
```

That's it. The bot connects to Discord, registers slash commands, and starts polling.  
Run `/help` in your server to verify.

### Optional: Twitch Instant Notifications

```bash
# Obtain a Twitch user token for EventSub (instant stream detection)
npm run twitch-auth
```

### Optional: Run with Dashboard

```bash
cd dashboard
npm install
npm run dev
# Dashboard at http://localhost:3000
```

Or start both together:

```bash
npm run dev:all
```

---

## Commands

| Command | What it does | Who can use it |
|---------|-------------|----------------|
| `/add youtube` | Monitor a YouTube channel | Manage Server |
| `/add twitch` | Monitor a Twitch streamer | Manage Server |
| `/remove` | Stop monitoring a creator | Manage Server |
| `/list` | Show all monitored creators | Everyone |
| `/status` | Bot health, quota, DB/Redis status | Everyone |
| `/forcepoll` | Immediate check of all creators | Manage Server |
| `/test-notification` | Send a test embed to verify setup | Manage Server |
| `/help` | Command reference | Everyone |

All commands use Discord's slash command interface — just type `/` and browse.

---

## Configuration

All configuration lives in `.env`. See [`.env.example`](.env.example) for a complete reference.

**Required:**

| Variable | Purpose |
|----------|---------|
| `DISCORD_TOKEN` | Bot login credential |
| `DISCORD_CLIENT_ID` | Command registration |
| `YOUTUBE_API_KEY` | YouTube Data API access |
| `TWITCH_CLIENT_ID` | Twitch API authentication |
| `TWITCH_CLIENT_SECRET` | Twitch API authentication |

**Polls & rates:**

| Variable | Default | Notes |
|----------|---------|-------|
| `YOUTUBE_POLL_INTERVAL` | 120s | RSS is free, so poll aggressively |
| `TWITCH_POLL_INTERVAL` | 60s | EventSub covers most starts; polling is fallback |
| `YOUTUBE_MAX_REQUESTS_PER_MINUTE` | 30 | Stay within 10k daily quota |
| `TWITCH_MAX_REQUESTS_PER_MINUTE` | 100 | Well under 800/min limit |

**Full variable reference** in [`.env.example`](.env.example) covers Redis TTLs, logging, dashboard port, and JWT secret.

---

## Deployment

The bot is deployment‑agnostic — run it anywhere Node 18+ runs.

### PM2 (recommended)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

### Docker

```bash
docker build -t veronicabot .
docker run -d --name veronicabot --restart unless-stopped --env-file .env veronicabot
```

### Systemd

Create `/etc/systemd/system/veronicabot.service`:

```ini
[Unit]
Description=VeronicaBot Discord Notifier
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/opt/veronicabot
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now veronicabot
```

---

## Architecture

### Polling

| Platform | Primary | Fallback | Interval |
|----------|---------|----------|----------|
| **YouTube** | RSS feeds (zero quota cost) | `videos.list` API (1 unit/50 videos) | Configurable (default 2 min) |
| **Twitch** | EventSub WebSocket (instant) | Helix `/streams` (1 min) | Configurable (default 1 min) |

### Data Layer

- **SQLite** (better‑sqlite3) — primary store, WAL mode, prepared‑statement cache
- **Redis** (Upstash REST) — optional secondary cache for live status, cooldowns, rate‑limit counters
- Bot **degrades gracefully** without Redis — all state lives in SQLite

### Rate Limiting

Three Bottleneck instances protect every external API:

| Limiter | Rate | Concurrency | Min spacing |
|---------|------|-------------|-------------|
| YouTube | 30 req/min | 2 | 200ms |
| Twitch | 100 req/min | 5 | 100ms |
| Discord | 30 msg/min | 2 | 500ms |

Dynamic backoff: 429 responses pause the limiter and resume after the `Retry-After` window.

---

## API

The embedded Express server (port 3001) provides:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/health` | Public | Service status |
| `POST /api/auth/discord` | Public | OAuth2 → JWT login |
| `GET /api/stats` | JWT | Aggregate bot statistics |
| `GET /api/creators` | JWT | All monitored creators |
| `POST /api/creators` | JWT | Add a creator |
| `DELETE /api/creators/:id` | JWT | Remove a creator |
| `GET /api/routing` | JWT | Notification routing rules |
| `POST /api/routing` | JWT | Add a routing rule |
| `DELETE /api/routing/:id` | JWT | Remove a routing rule |
| `GET /api/guilds` | JWT | List bot servers |
| `GET /api/guilds/:id/channels` | JWT | List guild channels |
| `GET /api/notifications` | JWT | Notification log count |

Rate limit: **30 requests / 10s per IP** (configurable in source).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Slash commands missing | Global command cache (up to 1h) | Set `DEV_GUILD_ID` for instant dev updates |
| "YouTube quota exceeded" | > 10k API units/day | Reduce `YOUTUBE_POLL_INTERVAL` or monitor fewer channels |
| Twitch not detecting streams | No user token for EventSub | Run `npm run twitch-auth` |
| Redis errors | Redis unavailable | Bot runs fine without Redis; check env vars |
| Bot offline / reconnecting | Gateway heartbeat blocked | Ensure no sync filesystem ops in event handlers |

Run `/status` for a live health dashboard in Discord.  
Run `/forcepoll` to test detection immediately after configuration changes.

---

## Project Structure

```
VeronicaBot/
├── src/
│   ├── index.js               # Entry point
│   ├── config/                # Env loader + validation
│   ├── database/              # SQLite init, migrations, queries
│   ├── cache/                 # Redis client (optional)
│   ├── commands/              # 8 slash commands
│   ├── scheduler/             # Polling orchestrator
│   ├── services/              # Discord, YouTube, Twitch, EventSub, rate limiter
│   ├── api/                   # Express REST server + JWT auth
│   ├── utils/                 # Embed builder, structured logger
│   └── importers/             # JSON bulk import
├── dashboard/                 # Next.js 14 web UI (optional)
├── scripts/                   # twitch-auth, force-register, debug
├── data/                      # SQLite database (auto‑created)
├── Dockerfile
├── ecosystem.config.cjs       # PM2 config
└── package.json
```

---

## Contributing

PRs are welcome. For feature requests or bug reports, [open an issue](https://github.com/instax-dutta/VeronicaBot/issues).

**Quick start for contributors:**

```bash
git clone https://github.com/instax-dutta/VeronicaBot.git
cd VeronicaBot
npm install
cp .env.example .env
# Set DEV_GUILD_ID for instant slash command syncing
npm run dev
```

Guidelines:

- Maintain ES module syntax (`import`/`export`)
- Keep Redis optional — all features must degrade gracefully
- Add or update JSDoc for new public functions
- Run `node --check` on changed files before committing

---

## License

[MIT](LICENSE) © 2024 [sdad.pro](https://sdad.pro)

---

<div align="center">
  <sub>Built with ❤️ for server owners who value privacy and control.</sub>
</div>
