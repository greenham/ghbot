# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a modern Discord bot built with Discord.js v14 that provides sound effects (both prefix and slash commands), text commands, fun facts, and scheduled events functionality for Discord servers. The bot uses SQLite database for dynamic guild configuration management and is designed for public distribution.

## Development Commands

### Running the Bot

```bash
# Install dependencies
pnpm install

# Local Node.js execution (requires Node 20+ LTS)
pnpm dev        # Development mode with auto-reload
pnpm start:prod # Production mode (local Node.js)

# Docker Compose (recommended for production)
pnpm start      # Start bot with Docker Compose
pnpm stop       # Stop bot
pnpm restart    # Restart bot (useful after config changes)
pnpm logs       # View logs
pnpm build      # Rebuild image
pnpm boom       # Quick rebuild and restart

# Direct Docker (alternative)
pnpm image:build  # Build Docker image
pnpm image:run    # Run Docker container with auto-restart
```

### Docker Management

```bash
# Docker Compose approach (recommended)
pnpm start && pnpm logs     # Start and follow logs
pnpm restart                # Restart after config changes
pnpm boom                   # Quick rebuild and restart after code changes

# Direct Docker approach
docker stop discord-bot && docker rm discord-bot
docker logs discord-bot -f
pnpm image:build && pnpm image:run
```

## Architecture & Key Components

### Core Structure

- **src/index.js**: Main bot entry point with Discord.js v14 client and event handlers
- **src/config/**: Configuration management
  - `config.js`: Hybrid config manager (SQLite database + file fallback)
  - `intents.js`: Discord gateway intents
- **src/commands/**:
  - `prefix/`: Traditional prefix commands (!sfx, !funfact, !hamfact, !role, !dance, !join, !leave, !reboot)
  - `slash/`: Modern slash commands (/sfx with autocomplete, /config with subcommands)
- **src/services/**:
  - `databaseService.js`: SQLite database operations and guild management
  - `voiceService.js`: Voice connections using @discordjs/voice
  - `commandLoader.js`: Static/Ankhbot command loader with hot-reload
  - `sfxManager.js`: Sound effect file management and caching
  - `schedulerService.js`: Scheduled events handler with timezone support
- **src/utils/**: Helper functions (randElement, chunkSubstr, etc.)
- **data/**: SQLite database directory (auto-created, mounted in Docker)

### Database System

**SQLite Database (data/ghbot.db):**
- **guilds table**: Per-server configurations with soft delete support
- **scheduled_events table**: Cron jobs with JSON schedule storage
- **bot_config table**: Global bot settings (activities, admin, blacklist)

**Configuration Flow:**
1. **Database primary**: Live configurations stored in SQLite
2. **File fallback**: config.json used for initial seeding and token storage
3. **Auto-migration**: Existing config.json guilds imported on first run
4. **Live updates**: `/config` slash commands update database directly

### Command System

Commands are handled in priority order:
1. **Prefix commands**: Modular commands in src/commands/prefix/
2. **Static text commands**: From conf/text_commands (pipe-delimited with aliases)
3. **Ankhbot commands**: From conf/ghbot.abcomg (legacy format support)

### Sound Effects System

- **Dual interfaces**: Both !sfx prefix command and /sfx slash command with autocomplete
- **Auto-discovery**: Sound files in sfx/ directory (.mp3/.wav) automatically available
- **Voice integration**: @discordjs/voice with connection pooling and cleanup
- **Configuration**: Volume and allowed channels configurable per guild via database

### Guild Management

**Auto-Registration System:**
- **GuildCreate event**: New guilds get default config + welcome message
- **GuildDelete event**: Soft delete preserves settings for re-invite
- **Welcome messages**: Different messages for new vs returning guilds
- **Slash command registration**: Automatic per-guild registration

### Configuration Files

- **conf/text_commands**: Pipe-delimited text commands with alias support
- **conf/funfacts & conf/hamfacts**: Line-separated fact collections with hot-reload
- **conf/ghbot.abcomg**: Ankhbot command database (JSON format, legacy eval support)
- **config.json**: Initial configuration and bot token (optional after seeding)

### Scheduled Events

**Storage**: Database with JSON schedule format support
**Formats**: 
- Object format: `{"hour": 7, "minute": 30, "tz": "America/Los_Angeles"}`
- Cron format: `"0 9 * * *"`
**Features**: Timezone support, role pings, channel targeting

### Docker Setup

- **Base image**: Node 20 full Debian (for better SQLite compatibility)
- **Package manager**: npm for Docker builds (bypasses pnpm security restrictions)
- **Multi-stage**: Single-stage build for simplicity and reliability
- **Persistence**: data/ volume for SQLite database
- **Dependencies**: All audio libraries and native modules properly compiled

## Important Implementation Details

- **Discord.js v14** with modern API patterns and explicit intents
- **@discordjs/voice** for audio playback with connection pooling
- **SQLite database** with better-sqlite3 for persistent configuration
- **Hybrid command system**: Traditional prefix commands + modern slash commands
- **Auto-registration**: Public bot ready - automatically configures new guilds
- **Soft delete system**: Guild settings preserved when bot is removed/re-added
- **Live configuration**: `/config` slash commands for real-time settings updates
- **Hot-reload**: Static commands and facts reload without restart
- **Voice system**: Modern @discordjs/voice with proper cleanup and error handling
- **Admin permissions**: Configuration changes require Administrator Discord permission
- **Logging**: Comprehensive logging for commands, SFX usage, and system events
- **Error handling**: Graceful handling of missing files, permissions, and malformed data