# VeronicaBot

A production-grade Discord bot for monitoring YouTube and Twitch channels for live streams and sending real-time notifications to Discord servers.

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Discord.js](https://img.shields.io/badge/Discord.js-14-orange.svg)

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Getting Started](#getting-started)
6. [Commands Reference](#commands-reference)
7. [Architecture](#architecture)
8. [Environment Variables](#environment-variables)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)
11. [License](#license)

---

## Overview

VeronicaBot is a powerful Discord notification bot that keeps your community informed when their favorite content creators go live on YouTube or Twitch. The bot monitors channels continuously and sends beautifully formatted Discord notifications with customizable role mentions, ensuring your members never miss a stream.

### What VeronicaBot Does

- Monitors YouTube channels for new video uploads and live streams
- Monitors Twitch streamers for live status changes  
- Sends rich, customizable Discord embed notifications
- Supports role mentions (@role) for stream alerts
- Provides a web dashboard for easy management
- Includes a REST API for programmatic access

---

## Features

### Core Features

| Feature | Description |
|---------|-------------|
| **YouTube Monitoring** | Monitors channels via RSS feeds (videos + live streams) |
| **Twitch Monitoring** | Dual-mode: polling + EventSub for instant notifications |
| **Rich Embeds** | Beautiful Discord notifications with thumbnails, timestamps, and customizable colors |
| **Role Mentions** | Ping specific roles when creators go live |
| **Duplicate Prevention** | Intelligent cooldown system prevents spam |
| **Multi-Server Support** | Same bot works across multiple Discord servers |

### Additional Features

- **Slash Commands**: Modern Discord interaction commands
- **Web Dashboard**: Next.js dashboard for visual management (optional)
- **REST API**: Programmatic access to creator data
- **Health Monitoring**: Built-in health checks and logging
- **Graceful Shutdown**: Clean startup and shutdown handling
- **Error Recovery**: Bot continues running even after errors

### Notification Features

- Customizable notification channel per creator
- Role mention support with `@here` or `@role`
- Live stream vs. video upload differentiation
- Notification cooldowns to prevent spam
- Thumbnail previews from YouTube/Twitch

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Node.js 18+ | JavaScript runtime |
| **Bot Framework** | Discord.js 14 | Discord bot API |
| **Database** | SQLite (better-sqlite3) | Local data storage |
| **Cache** | Upstash Redis | Rate limiting & caching |
| **Dashboard** | Next.js 14 | Web UI (optional) |
| **API Server** | Express.js | REST API |
| **HTTP Client** | Axios | External API calls |
| **Process Manager** | PM2 | Production deployment |

### Project Structure

```
VeronicaBot/
├── src/                        # Bot source code
│   ├── api/                    # Express REST API server
│   │   ├── index.js           # API server entry point
│   │   └── middleware.js      # Authentication middleware
│   ├── cache/                 # Redis cache layer
│   │   └── redis.js           # Upstash Redis operations
│   ├── commands/              # Discord slash commands
│   │   ├── add.js            # Add creator command
│   │   ├── remove.js         # Remove creator command
│   │   ├── list.js           # List creators command
│   │   ├── status.js         # Bot status command
│   │   ├── forcepoll.js      # Force poll command
│   │   ├── test-notification.js # Test notification command
│   │   ├── help.js           # Help command
│   │   └── index.js          # Command loader
│   ├── config/                # Configuration management
│   │   └── index.js          # Env var loader & validation
│   ├── database/              # SQLite database layer
│   │   ├── index.js          # DB initialization
│   │   └── queries.js        # CRUD operations
│   ├── scheduler/             # Polling scheduler
│   │   └── index.js          # Scheduler logic
│   ├── services/              # External service integrations
│   │   ├── discord.js        # Discord client setup
│   │   ├── youtube.js        # YouTube API client
│   │   ├── twitch.js          # Twitch API client
│   │   ├── twitchEventSub.js # Twitch EventSub WebSocket
│   │   ├── twitchUserToken.js # Twitch user token management
│   │   └── rateLimiter.js    # Rate limiting
│   ├── utils/                 # Utility functions
│   │   ├── embeds.js         # Discord embed templates
│   │   └── logger.js         # Logging utility
│   ├── importers/             # Data import utilities
│   │   └── creators.js       # Bulk creator importer
│   └── index.js              # Bot entry point
├── dashboard/                  # Next.js web dashboard
│   ├── src/                  # Dashboard source
│   ├── public/               # Static assets
│   └── package.json          # Dashboard dependencies
├── data/                      # Data directory
│   └── notifoty.db          # SQLite database file
├── scripts/                    # Utility scripts
│   └── twitch-auth.js        # Twitch authentication
├── package.json               # Main dependencies
├── ecosystem.config.cjs      # PM2 configuration
├── Dockerfile                # Docker configuration
└── .env.example              # Environment template
```

---

## Prerequisites

### Required API Keys & Accounts

You will need to obtain the following credentials before running the bot:

#### 1. Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** and give it a name (e.g., "VeronicaBot")
3. Navigate to **"Bot"** in the left sidebar
4. Click **"Reset Token"** and copy the token
5. **Important**: Save this token securely - it cannot be retrieved again!
6. Go to **"OAuth2" → "URL Generator"**
7. Select scopes: `bot` and `applications.commands`
8. Select bot permissions: `Send Messages`, `Embed Links`, `Mention Everyone`
9. Copy the generated URL, open it in your browser, and add the bot to your server
10. Copy the **Application ID** from the **"General Information"** page

#### 2. YouTube Data API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (any name you prefer)
3. Search for **"YouTube Data API v3"** and enable it
4. Go to **"Credentials"** → **"Create Credentials"** → **"API Key"**
5. Copy the generated API key
6. **Note**: YouTube API has a free quota of 10,000 units/day

#### 3. Twitch API Credentials

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Click **"Register Your Application"**
3. Fill in:
   - Name: anything (e.g., "VeronicaBot")
   - OAuth Redirect URL: `http://localhost`
   - Category: Chat Bot
4. Click **"Manage"** on your created application
5. Copy the **Client ID**
6. Click **"New Secret"** and copy the **Client Secret**

#### 4. Upstash Redis (Free Tier)

1. Go to [Upstash](https://upstash.com) and sign up
2. Create a new Redis database (any name, select nearest region)
3. Go to the **"REST API"** tab
4. Copy both:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

#### 5. (Optional) Discord OAuth2 for Dashboard

If using the web dashboard:

1. Go back to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to **"OAuth2"** → **"General"**
4. Copy the **Client Secret**

---

## Getting Started

### Step 1: Clone the Repository

```bash
git clone https://github.com/instax-dutta/Notifoty.git
cd VeronicaBot
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

```bash
cp .env.example .env
```

Edit the `.env` file with your API credentials. See the [Environment Variables](#environment-variables) section for all options.

### Step 4: Initialize Database

The database is automatically created on first run. For manual initialization:

```bash
# The database will be created at data/notifoty.db
npm start
```

### Step 5: Start the Bot

#### Development Mode

```bash
# Start just the bot
npm run dev

# Start bot + dashboard (requires dashboard setup)
npm run dev:all
```

#### Production Mode

```bash
npm start
```

### Step 6: Verify Startup

You should see output similar to:

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🔔 VERONICA                                            ║
║                                                           ║
║   YouTube & Twitch Live Notification Bot                 ║
║   Version 2.1.0 (SQLite + Redis)                        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

📊 Creator Statistics:
   YouTube channels: 0
   Twitch streamers: 0
   Total:            0

✅ Connected to SQLite database
✅ Connected to Upstash Redis
✅ Discord bot "Veronica" logged in
🚀 Veronica is running!
```

---

## Commands Reference

All commands use Discord's slash command interface. Type `/` in your Discord server to see available commands.

### Command List

| Command | Description | Example |
|---------|-------------|---------|
| `/add youtube` | Add a YouTube channel to monitor | `/add youtube channel_id:UCX6OQ3DkcsbYNE6H8uQQuVA display_name:MrBeast notification_channel:#live-alerts` |
| `/add twitch` | Add a Twitch streamer to monitor | `/add twitch username:xQc display_name:xQc notification_channel:#live-alerts` |
| `/remove` | Stop monitoring a creator | `/remove creator_id:12345` |
| `/list` | List all monitored creators | `/list` |
| `/status` | Check bot health and stats | `/status` |
| `/forcepoll` | Force check all creators now | `/forcepoll` |
| `/test-notification` | Send a test notification | `/test-notification` |
| `/help` | Show help information | `/help` |

### Command Details

#### `/add youtube`

Adds a YouTube channel to the monitoring list.

**Parameters:**
- `channel_id` (required): YouTube channel ID (e.g., `UCX6OQ3DkcsbYNE6H8uQQuVA`)
- `display_name` (required): Name to show in notifications
- `notification_channel` (required): Discord channel for notifications
- `role_to_mention` (optional): Role to ping when live
- `notify_videos` (optional): Notify for regular videos (default: true)
- `notify_live` (optional): Notify for live streams (default: true)

**Finding YouTube Channel ID:**
- Go to the YouTube channel → About tab → Share → Copy channel ID
- Or find it in the URL: `youtube.com/channel/UCxxxxxxxx`

#### `/add twitch`

Adds a Twitch streamer to the monitoring list.

**Parameters:**
- `username` (required): Twitch username (e.g., `xQc`)
- `display_name` (required): Name to show in notifications
- `notification_channel` (required): Discord channel for notifications
- `role_to_mention` (optional): Role to ping when live

#### `/remove`

Removes a creator from the monitoring list.

**Parameters:**
- `creator_id` (required): The ID of the creator to remove (use `/list` to find IDs)

#### `/list`

Shows all monitored creators with their IDs and status.

**Parameters:**
- `platform` (optional): Filter by `youtube` or `twitch`

#### `/status`

Shows bot health, connection status, and statistics.

#### `/forcepoll`

Forces an immediate check of all monitored creators. Useful for testing or after adding new creators.

#### `/test-notification`

Sends a test notification to verify your notification channel is working correctly.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         VeronicaBot                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │   Discord    │    │   YouTube    │    │   Twitch     │    │
│  │      API     │    │      API     │    │      API     │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                   │             │
│         ▼                   ▼                   ▼             │
│  ┌─────────────────────────────────────────────────────┐      │
│  │              Scheduler (Polling Loop)               │      │
│  │   - YouTube: Every 2 minutes (RSS feeds)            │      │
│  │   - Twitch: Every 1 minute (API + EventSub)         │      │
│  └──────────────────────┬──────────────────────────────┘      │
│                         │                                      │
│         ┌───────────────┼───────────────┐                     │
│         ▼               ▼               ▼                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │  SQLite    │  │   Redis    │  │  Discord   │              │
│  │ Database   │  │   Cache    │  │  Notifier  │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐      │
│  │           Express API Server (Port 3001)            │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Scheduler** runs at configured intervals
2. Fetches current live status from YouTube/Twitch APIs
3. Compares with cached/database state
4. If status changed (offline → online):
   - Send Discord notification
   - Update database
   - Update Redis cache
5. Apply cooldown to prevent duplicate notifications

### Database Schema

```sql
-- Creators table
CREATE TABLE creators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,        -- 'youtube' or 'twitch'
    platform_id TEXT NOT NULL,     -- Channel ID or username
    display_name TEXT NOT NULL,
    guild_id TEXT NOT NULL,        -- Discord server ID
    channel_id TEXT NOT NULL,      -- Notification channel ID
    role_id TEXT,                  -- Role to mention (optional)
    notify_video INTEGER DEFAULT 1, -- Notify for videos
    notify_live INTEGER DEFAULT 1, -- Notify for live
    is_live INTEGER DEFAULT 0,     -- Current live status
    last_checked TEXT,             -- Last check timestamp
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, platform_id, guild_id)
);

-- Notification history
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,
    type TEXT NOT NULL,            -- 'video' or 'live'
    notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(creator_id) REFERENCES creators(id)
);
```

### Redis Cache Strategy

| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `live:{platform}:{id}` | Current live status | 5 minutes |
| `cooldown:{creator_id}` | Notification cooldown | 1 minute |
| `ratelimit:{service}` | API rate limit tracking | 1 minute |

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Discord bot token | `MTAx...` |
| `DISCORD_CLIENT_ID` | Discord application ID | `123456789...` |
| `YOUTUBE_API_KEY` | YouTube Data API key | `AIza...` |
| `TWITCH_CLIENT_ID` | Twitch client ID | `abc123...` |
| `TWITCH_CLIENT_SECRET` | Twitch client secret | `secret123...` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | `https://...upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | `AX...` |

### Optional Variables

#### Discord Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_NAME` | `Veronica` | Bot name displayed in embeds |
| `BOT_STATUS` | `online` | Bot status (online, idle, dnd, invisible) |
| `BOT_ACTIVITY_TYPE` | `WATCHING` | Activity type (PLAYING, WATCHING, LISTENING, COMPETING) |
| `BOT_ACTIVITY_TEXT` | `live streams` | Activity text |
| `BOT_ADMIN_IDS` | - | Comma-separated admin user IDs |
| `DEV_GUILD_ID` | - | Development server ID for instant command updates |

#### Polling Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `YOUTUBE_POLL_INTERVAL` | `120000` | YouTube check interval (ms, 2 min) |
| `TWITCH_POLL_INTERVAL` | `60000` | Twitch check interval (ms, 1 min) |
| `YOUTUBE_MAX_REQUESTS_PER_MINUTE` | `30` | YouTube API rate limit |
| `TWITCH_MAX_REQUESTS_PER_MINUTE` | `100` | Twitch API rate limit |

#### Database Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/notifoty.db` | SQLite database path |
| `DATABASE_VERBOSE` | `false` | Enable SQL query logging |

#### Cache Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_LIVE_TTL` | `300` | Live status cache TTL (seconds) |
| `REDIS_COOLDOWN_TTL` | `60` | Cooldown cache TTL (seconds) |
| `REDIS_RATELIMIT_TTL` | `60` | Rate limit cache TTL (seconds) |

#### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `HEALTH_CHECK_INTERVAL` | `600000` | Health check interval (ms, 10 min) |

#### API Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `3001` | REST API server port |
| `API_SECRET` | - | JWT secret for API authentication |
| `DASHBOARD_URL` | `http://localhost:3000` | Dashboard URL for CORS |
| `DISCORD_CLIENT_SECRET` | - | Discord OAuth2 client secret |

### Complete .env Example

```env
# ===========================================
# DISCORD CONFIGURATION
# ===========================================
DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN_HERE
DISCORD_CLIENT_ID=YOUR_DISCORD_CLIENT_ID_HERE
DEV_GUILD_ID=YOUR_DEV_GUILD_ID_HERE

# ===========================================
# BOT CUSTOMIZATION
# ===========================================
BOT_NAME=Veronica
BOT_STATUS=online
BOT_ACTIVITY_TYPE=WATCHING
BOT_ACTIVITY_TEXT=live streams
BOT_ADMIN_IDS=123456789,987654321

# ===========================================
# YOUTUBE CONFIGURATION
# ===========================================
YOUTUBE_API_KEY=YOUR_YOUTUBE_API_KEY_HERE

# ===========================================
# TWITCH CONFIGURATION
# ===========================================
TWITCH_CLIENT_ID=YOUR_TWITCH_CLIENT_ID_HERE
TWITCH_CLIENT_SECRET=YOUR_TWITCH_CLIENT_SECRET_HERE

# ===========================================
# POLLING INTERVALS
# ===========================================
YOUTUBE_POLL_INTERVAL=120000
TWITCH_POLL_INTERVAL=60000

# ===========================================
# RATE LIMITING
# ===========================================
YOUTUBE_MAX_REQUESTS_PER_MINUTE=30
TWITCH_MAX_REQUESTS_PER_MINUTE=100

# ===========================================
# DATABASE - SQLite
# ===========================================
DATABASE_PATH=./data/notifoty.db
DATABASE_VERBOSE=false

# ===========================================
# CACHE - Upstash Redis
# ===========================================
UPSTASH_REDIS_REST_URL=YOUR_UPSTASH_REDIS_REST_URL_HERE
UPSTASH_REDIS_REST_TOKEN=YOUR_UPSTASH_REDIS_REST_TOKEN_HERE
REDIS_LIVE_TTL=300
REDIS_COOLDOWN_TTL=60
REDIS_RATELIMIT_TTL=60

# ===========================================
# LOGGING
# ===========================================
LOG_LEVEL=info
HEALTH_CHECK_INTERVAL=600000

# ===========================================
# DASHBOARD API
# ===========================================
API_PORT=3001
API_SECRET=YOUR_STRONG_RANDOM_SECRET_HERE
DASHBOARD_URL=http://localhost:3000
DISCORD_CLIENT_SECRET=YOUR_DISCORD_CLIENT_SECRET_HERE
```

---

## Deployment

### Option 1: PM2 (Recommended for VPS/Dedicated Server)

PM2 provides process management, auto-restart, and log management.

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start npm --name "veronicabot" -- start

# Save PM2 process list (auto-restart on reboot)
pm2 save

# Generate startup script
pm2 startup

# Useful PM2 commands
pm2 status                    # Check status
pm2 logs veronicabot          # View logs
pm2 restart veronicabot       # Restart
pm2 stop veronicabot         # Stop
pm2 monit                    # Monitor resources
```

### Option 2: Docker

```bash
# Build the Docker image
docker build -t veronicabot .

# Run the container
docker run -d \
  --name veronicabot \
  --restart unless-stopped \
  --env-file .env \
  veronicabot

# View logs
docker logs -f veronicabot
```

### Option 3: Screen (Development/Testing)

```bash
# Create a screen session
screen -S veronicabot

# Run the bot
npm start

# Detach: Press Ctrl+A, then D
# Reattach: screen -r veronicabot
```

### Option 4: Systemd (Linux Production)

Create `/etc/systemd/system/veronicabot.service`:

```ini
[Unit]
Description=VeronicaBot Discord Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/VeronicaBot
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable veronicabot
sudo systemctl start veronicabot
```

---

## Troubleshooting

### Common Issues

#### Bot Won't Start

**Error: "Missing required environment variables"**

```bash
# Verify your .env file exists and has all required values
cat .env | grep -v "^#" | grep -v "^$"
```

**Error: "Failed to connect to database"**

```bash
# Check database path exists
mkdir -p data

# Check SQLite is installed
npm list better-sqlite3
```

#### Discord Issues

**Slash commands not showing**

```bash
# Commands are registered globally - may take up to 1 hour to appear
# For instant updates, set DEV_GUILD_ID in .env
```

**Bot joined but has no permissions**

```bash
# Re-invite with correct permissions:
# - Send Messages
# - Embed Links  
# - Mention @everyone (for role notifications)
```

#### YouTube Issues

**"YouTube API quota exceeded"**

- YouTube API has 10,000 units/day free
- Each channel check costs ~1 unit
- Reduce `YOUTUBE_POLL_INTERVAL` or limit channels

**Not detecting live streams**

- Verify channel ID is correct (starts with `UC`)
- Check if channel actually has live stream
- Run `/forcepoll` to test immediately

#### Twitch Issues

**"Twitch credentials invalid"**

- Verify Client ID and Secret are correct
- Run `npm run twitch-auth` to refresh token

**Not getting instant notifications**

- EventSub requires a public callback URL
- For local development, use a tunneling service like `ngrok`
- Polling provides notifications but with 1-minute delay

#### Redis Issues

**Redis connection failed**

- Verify UPSTASH_REDIS_REST_URL and TOKEN are correct
- Bot will run without Redis (using database only) but with reduced performance
- Notifications will still work but rate limiting may be less effective

---

### Debugging Commands

```bash
# Check bot status in Discord
/status

# Force check all creators
/forcepoll

# List all monitored creators
/list

# View bot logs
pm2 logs veronicabot

# Check environment
node -e "require('dotenv').config(); console.log(Object.keys(process.env).filter(k => !k.includes('SECRET')).join('\n'))"
```

### Health Checks

The bot performs automatic health checks:

- Database connectivity
- Redis connectivity  
- Discord connection
- API credential validation

Check health with `/status` command in Discord.

---

## License

MIT License

Copyright (c) 2024 sdad.pro

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Support

- Check the [issues](https://github.com/instax-dutta/Notifoty/issues) for common problems
- For custom bot development, visit [sdad.pro](https://sdad.pro)

---

## Acknowledgments

- [Discord.js](https://discord.js.org/) - Discord API library
- [YouTube Data API](https://developers.google.com/youtube/v3) - YouTube integration
- [Twitch API](https://dev.twitch.tv/docs/api) - Twitch integration
- [Upstash](https://upstash.com) - Redis cache
- [Next.js](https://nextjs.org/) - Dashboard framework

---

<div align="center">

Made with ❤️ by [sdad.pro](https://sdad.pro)

</div>
