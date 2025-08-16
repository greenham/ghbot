# GHBot - Discord Sound Effects Bot

A modern Discord bot built with Discord.js v14 that provides sound effects, text commands, fun facts, and scheduled events for Discord servers.

## ✨ Features

### 🔊 Sound Effects

- **Prefix commands**: `!sfx <sound>` - Classic text-based commands
- **Slash commands**: `/sfx` with autocomplete - Modern Discord UI with searchable sound effects
- Automatic sound discovery from the `sfx/` directory
- Configurable volume and channel restrictions per guild

### 💬 Text Commands

- **Fun Facts**: Random or specific fact retrieval (`!funfact [number]`)
- **Ham Facts**: Ham-related facts (`!hamfact [number]`)
- **Static Commands**: Custom text responses loaded from configuration files
- **Ankhbot Import**: Support for imported Ankhbot command databases

### 🎭 Interactive Features

- **Role Management**: Self-service role assignment (`!role add/remove <role>`)
- **Dance Command**: ASCII art dance animation
- **Voice Controls**: Join/leave voice channels (`!join`, `!leave`)

### ⏰ Scheduling

- **Scheduled Events**: Cron-based message scheduling with role pings
- **Activity Rotation**: Automatic bot status updates

### 🛠️ Admin Features

- **Multi-guild Support**: Configure different settings per Discord server
- **Hot Reload**: Configuration files update without restart
- **Admin Commands**: Bot management and restart capabilities
- **Blacklist System**: Block specific users from using commands

## 🚀 Quick Start

### Prerequisites

- Node.js 22 LTS
- pnpm package manager
- Discord Bot Token (see Discord Setup section below)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/greenham/ghbot.git
   cd ghbot
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Configure the bot**

   ```bash
   cp config.example.json config.json
   # Edit config.json with your bot token and guild settings
   ```

4. **Set up Discord Bot** (see Discord Setup section below)

5. **Run the bot**

   ```bash
   # Development mode with auto-reload
   pnpm dev

   # Production mode
   pnpm start
   ```

## 🐳 Docker Deployment

### Recommended: Docker Compose

```bash
# Start the bot with Docker Compose
pnpm up

# View logs
pnpm logs

# Restart the bot (useful after config changes)
pnpm restart

# Stop the bot
pnpm down

# Rebuild and restart (after code changes)
pnpm build && pnpm up
```

**Benefits of Docker Compose:**
- Update `config.json`, `sfx/`, and `conf/` files without rebuilding the image
- Automatic restart on failure
- Easy log management
- Resource limits and health checks

### Alternative: Direct Docker

```bash
# Build the Docker image
pnpm image:build

# Run the container
pnpm image:run
```

## 📖 Usage

### Sound Effects

**Prefix Command:**

```
!sfx albert          # Play 'albert' sound effect
!sfx                 # List all available sounds
```

**Slash Command:**

```
/sfx sound: albert   # Play with autocomplete suggestions
```

### Text Commands

```
!funfact             # Random fun fact
!funfact 42          # Specific fun fact #42
!hamfact             # Random ham radio fact
!dance               # ASCII dance animation
```

### Role Management

```
!role add streamer   # Add the 'streamer' role
!role remove vip     # Remove the 'vip' role
```

### Voice Commands

```
!join                # Join your voice channel
!leave               # Leave current voice channel
```

## 🔧 Discord Setup

### Creating a Discord Bot

1. **Go to Discord Developer Portal**

   - Visit https://discord.com/developers/applications
   - Click "New Application" and give it a name

2. **Create Bot User**

   - Go to the "Bot" section
   - Click "Add Bot"
   - Copy the bot token for your config.json

3. **Enable Required Intents**
   Under "Privileged Gateway Intents", enable:

   - **SERVER MEMBERS INTENT** (Required for role management)
   - **MESSAGE CONTENT INTENT** (Required for prefix commands)

4. **Bot Permissions**
   When inviting the bot, ensure it has these permissions:

   - Send Messages
   - Embed Links
   - Read Message History
   - Connect (for voice channels)
   - Speak (for voice channels)
   - Use Voice Activity
   - Manage Roles (if using role commands)

5. **Invite Bot to Server**
   - Go to "OAuth2 > URL Generator"
   - Select "bot" and "applications.commands" scopes
   - Select the permissions listed above
   - Use the generated URL to invite your bot

## ⚙️ Configuration

### Basic Configuration

Copy `config.example.json` to `config.json` and customize:

```json
{
  "botName": "YourBot",
  "debug": false,
  "discord": {
    "token": "YOUR_BOT_TOKEN",
    "adminUserId": "YOUR_DISCORD_USER_ID",
    "guilds": [
      {
        "id": "GUILD_ID",
        "internalName": "My Server",
        "prefix": "!",
        "enableSfx": true,
        "allowedSfxChannels": "general|voice-chat",
        "sfxVolume": 0.5,
        "enableFunFacts": true,
        "enableHamFacts": true
      }
    ],
    "activities": ["Playing sounds", "Serving facts"],
    "blacklistedUsers": []
  }
}
```

### Sound Effects Setup

1. Add `.mp3` or `.wav` files to the `sfx/` directory
2. Files are automatically discovered (filename becomes command name)
3. Sounds appear in slash command autocomplete

### Static Commands

Edit `conf/text_commands` with pipe-separated commands:

```
hello|Hello there!
wiki,wikipedia|https://wikipedia.org
help,commands|Available commands: !sfx, !funfact, !hamfact
```

### Scheduled Events

Add to guild configuration:

```json
"scheduledEvents": [
  {
    "id": "daily-greeting",
    "schedule": "0 9 * * *",
    "channelId": "CHANNEL_ID",
    "message": "Good morning everyone!",
    "pingRoleId": "ROLE_ID"
  }
]
```

## 🏗️ Architecture

```
src/
├── index.js                 # Main bot entry point
├── config/
│   ├── config.js            # Configuration loader
│   └── intents.js          # Discord gateway intents
├── commands/
│   ├── prefix/             # Traditional prefix commands
│   └── slash/              # Modern slash commands
├── services/
│   ├── voiceService.js     # Voice connection management
│   ├── commandLoader.js    # Static/Ankhbot command loader
│   ├── sfxManager.js       # Sound effect file management
│   └── schedulerService.js # Scheduled events handler
└── utils/
    └── helpers.js          # Utility functions
```

## 🧪 Development

### Running in Development Mode

```bash
pnpm dev  # Uses nodemon for auto-reload
```

### Adding New Commands

**Prefix Command Example:**

```javascript
// src/commands/prefix/hello.js
module.exports = {
  name: "hello",
  description: "Say hello",

  async execute(message, args, guildConfig) {
    await message.channel.send("Hello there!");
  },
};
```

**Slash Command Example:**

```javascript
// src/commands/slash/ping.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),

  async execute(interaction, guildConfig) {
    await interaction.reply("Pong!");
  },
};
```

## 📊 System Requirements

- **Node.js**: 22 LTS or higher
- **Memory**: 256MB+ RAM
- **Storage**: 500MB+ (depending on sound effects)
- **Network**: Stable internet connection for Discord API

## 🔧 Troubleshooting

### Common Issues

**"Used disallowed intents" Error**

- Enable required intents in Discord Developer Portal (see Discord Setup section above)
- Ensure SERVER MEMBERS INTENT and MESSAGE CONTENT INTENT are enabled

**Voice/Audio Issues**

- Ensure ffmpeg is installed (handled automatically in Docker)
- Check bot has Connect and Speak permissions
- Verify voice channel isn't full or restricted

**Slash Commands Not Appearing**

- Commands register on bot startup
- May take up to 1 hour to appear globally
- Try restarting the bot

**Permission Errors**

- Ensure bot has necessary permissions in channels
- Check role hierarchy (bot role should be above managed roles)

### Debug Mode

Enable debug logging in `config.json`:

```json
{
  "debug": true
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Discord.js v14](https://discord.js.org/)
- Audio processing via [@discordjs/voice](https://github.com/discordjs/voice)
- Inspired by the original AnkhBot command system
- Special thanks to the Discord.js community

## 📞 Support

- Create an [Issue](https://github.com/greenham/ghbot/issues) for bug reports
- Check the Discord Setup section above for configuration help
- Review [CLAUDE.md](CLAUDE.md) for development guidance

---

Made with ❤️ for Discord communities
