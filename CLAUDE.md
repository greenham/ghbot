# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Discord bot built with discord.js v14 that provides sound effects (both prefix and slash commands), text commands, fun facts, and scheduled events functionality for Discord servers.

## Development Commands

### Running the Bot

```bash
# Install dependencies
pnpm install

# Direct Node.js execution (requires Node 22 LTS)
pnpm start  # Production mode
pnpm dev    # Development mode with auto-reload

# Docker commands
pnpm docker:build  # Build Docker image
pnpm docker:run    # Run Docker container with auto-restart
```

### Docker Management

```bash
# Stop and remove container
docker stop ghbot && docker rm ghbot

# View logs
docker logs ghbot -f

# Rebuild and restart
docker stop ghbot && docker rm ghbot && pnpm docker:build && pnpm docker:run
```

## Architecture & Key Components

### Core Structure

- **src/index.js**: Main bot entry point with Discord.js v14 client
- **src/config/**: Configuration management
  - `config.js`: Config loader and validator
  - `intents.js`: Discord gateway intents
- **src/commands/**:
  - `prefix/`: Traditional prefix commands (!sfx, !funfact, etc.)
  - `slash/`: Slash commands (/sfx with autocomplete)
- **src/services/**:
  - `voiceService.js`: Voice connections using @discordjs/voice
  - `commandLoader.js`: Static/Ankhbot command loader
  - `sfxManager.js`: Sound effect file management
  - `schedulerService.js`: Scheduled events handler
- **src/utils/**: Helper functions
- **config.json**: Bot configuration (copy from config.json.example)

### Command System

Commands are handled in priority order:
1. Native commands (defined in index.js commands object)
2. Static text commands (from conf/text_commands)
3. Ankhbot imported commands (from conf/ghbot.abcomg)

### Sound Effects System

- Sound files stored in `sfx/` directory as .mp3 or .wav
- Automatically discovered on startup and directory changes
- Requires voice channel connection and ffmpeg (included in Docker image)
- Volume and audio passes configurable per guild

### Configuration Files

- **conf/text_commands**: Pipe-delimited text commands with alias support
- **conf/funfacts & conf/hamfacts**: Line-separated fact collections
- **conf/snesgames.json**: SNES game database (purpose unclear from current usage)

### Scheduled Events

Configured per guild in config.json with cron-style scheduling using node-schedule. Events can:
- Send messages to specific channels
- Ping specific roles
- Run on cron schedules

### Docker Setup

Uses Node 22-alpine base image with ffmpeg for audio processing. The Dockerfile installs all dependencies and runs the bot with `node src/index.js`.

## Important Implementation Details

- Discord.js v14 with modern API patterns
- @discordjs/voice for audio playback
- Hybrid command system: prefix commands + slash command for SFX
- /sfx slash command with autocomplete for easy sound discovery
- Hot-reloads configuration files and commands without restart
- Supports multiple guilds with individual configurations
- Admin commands restricted by Discord user ID
- Blacklist system for blocking specific users
- Proper voice connection pooling and cleanup