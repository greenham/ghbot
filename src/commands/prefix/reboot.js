const configManager = require("../../config/config");

module.exports = {
  name: "reboot",
  description: "Reboot the bot (admin only)",

  async execute(message, args, guildConfig) {
    // Get bot configuration
    const botConfig = configManager.getBotConfig();
    
    // Check if user is the bot admin
    if (message.author.id !== botConfig.discord.adminUserId) {
      return;
    }

    await message.reply("Rebooting...");
    console.log(`Reboot requested by ${message.author.username}`);

    // Exit the process - requires a process manager like PM2 or Docker restart policy
    process.exit(0);
  },
};
