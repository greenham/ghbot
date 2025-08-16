const { GatewayIntentBits } = require('discord.js');

module.exports = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.MessageContent,  // Required for prefix commands
  GatewayIntentBits.GuildMembers     // Required for role management
  // GatewayIntentBits.GuildPresences - Requires special permission in Discord Developer Portal
];