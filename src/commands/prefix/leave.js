const voiceService = require('../../services/voiceService');

module.exports = {
  name: 'leave',
  description: 'Make the bot leave the voice channel',
  
  async execute(message, args, guildConfig) {
    // Check if connected to a voice channel
    if (!voiceService.isConnected(message.guild.id)) {
      return message.reply("If ya don't eat your meat, ya can't have any pudding!");
    }

    voiceService.leave(message.guild.id);
    await message.react('👋');
  }
};