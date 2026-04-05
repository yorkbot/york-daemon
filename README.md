# York Discord Bot

Discord bot for the York multi-agent system. Maps Discord channels to Claude Code agent directories on RPi5.

Fork of [chadingTV/claudecode-discord](https://github.com/chadingTV/claudecode-discord) (MIT license).

## Setup

```bash
npm install
cp .env.example .env  # edit with your credentials
npm run build
npm start
```

## Architecture

See `CLAUDE.md` for full documentation.

Each Discord channel maps to an agent directory under `~/agents/`. The bot spawns Claude Code sessions in those directories, reading the agent's `CLAUDE.md` and `.mcp.json` automatically.

## Additions to upstream

- Per-channel model selection (`/set-model`)
- Cron job scheduler (`/schedule`, `/jobs`)
- Simplified to English-only
- Removed tray/menubar apps, install scripts, multi-platform launchers
