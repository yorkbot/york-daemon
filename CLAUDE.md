# york-daemon — York Agent System

The main daemon for the York multi-agent system. Fork of chadingTV/claudecode-discord. Routes Discord channels to Claude Code agent directories, runs cron scheduler, manages sessions.

## Architecture

```
Discord message in #offa
  → bot/handlers/message.ts (auth check, rate limit)
  → claude/session-manager.ts (spawns Claude Agent SDK subprocess)
  → Claude Code runs in ~/agents/offa/ (reads CLAUDE.md + .mcp.json)
  → Response streams back to Discord
```

## Key Files

- `src/index.ts` — Entry point, lock file, DB init, bot start, scheduler start
- `src/bot/client.ts` — Discord client, slash command registration, event handlers
- `src/bot/commands/` — Slash command handlers (13 commands)
- `src/bot/handlers/message.ts` — Message processing, file uploads, queue management
- `src/bot/handlers/interaction.ts` — Button/select menu handling (tool approval, questions)
- `src/claude/session-manager.ts` — Claude Agent SDK integration, streaming, model selection, tool approval
- `src/claude/output-formatter.ts` — Discord embeds, message splitting, UI components
- `src/db/database.ts` — SQLite schema, queries for projects, sessions, scheduled jobs
- `src/db/types.ts` — TypeScript interfaces (Project, Session, ScheduledJob)
- `src/scheduler.ts` — Cron job scheduler (checks every 60s, fires prompts through session manager with jitter)
- `src/security/guard.ts` — User authorization, rate limiting, path validation
- `src/utils/config.ts` — Zod-validated .env config
- `src/utils/i18n.ts` — Bilingual strings (English/Korean)

## York-Specific Additions (vs upstream)

1. **Per-channel model selection** — `model` column in projects table, `/set-model` command, passed to Claude Agent SDK `query()` options
2. **Cron scheduler** — `scheduled_jobs` table, `/schedule` and `/jobs` commands, 60s polling, fires prompts via session manager with 0-30s jitter
3. **Agent system** — BASE_PROJECT_DIR points to ~/agents/, each subdir has CLAUDE.md + .mcp.json

## Database Schema

- **projects** — channel_id → project_path, auto_approve, model
- **sessions** — channel_id → session_id, status, last_activity
- **scheduled_jobs** — channel_id → cron_expression, prompt, enabled, model_override, last_run

## Commands

| Command | Description |
|---------|-------------|
| `/register <path>` | Map channel to agent directory |
| `/unregister` | Remove channel mapping |
| `/set-model <model>` | Set model (opus/sonnet) for channel |
| `/auto-approve <on/off>` | Toggle tool auto-approval |
| `/schedule <cron> <prompt>` | Create scheduled cron job |
| `/jobs list/delete/toggle` | Manage scheduled jobs |
| `/status` | Show all projects and sessions |
| `/stop` | Stop current session |
| `/sessions` | List/resume saved sessions |
| `/clear-sessions` | Delete all sessions for channel |
| `/queue list/clear` | View/clear message queue |
| `/last` | Show last message from session |
| `/usage` | Show Claude usage stats |

## Tool Approval Logic (canUseTool)

1. AskUserQuestion → Discord question UI, collect answers
2. Read-only tools (Read, Glob, Grep, WebSearch, WebFetch, TodoWrite) → auto-approve
3. Channel `auto_approve` enabled → auto-approve all
4. Otherwise → Discord button embed, wait for user (5min timeout)

## Config (.env)

```
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=1473331036099444870
ALLOWED_USER_IDS=366037340193554432
BASE_PROJECT_DIR=/home/york/agents
RATE_LIMIT_PER_MINUTE=10
SHOW_COST=true
```

## Build & Run

```bash
npm install
npm run build    # tsup → dist/index.js
npm start        # node dist/index.js
npm run dev      # tsx src/index.ts (development)
npm test         # vitest
```

## TypeScript Conventions

- ESM module (`"type": "module"`), use `.js` extension in local imports
- strict mode, `noUnusedLocals` and `noUnusedParameters` enabled
- Target: ES2022, moduleResolution: bundler
- Zod v4 (not v3)
- Use `path.join()` for paths

## Systemd Service

Service file at `~/.config/systemd/user/york.service`. Managed with:
```bash
systemctl --user start york
systemctl --user enable york
journalctl --user -u york -f
```
