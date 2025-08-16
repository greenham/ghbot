const voiceService = require('../../services/voiceService');

module.exports = {
  name: 'join',
  description: 'Make the bot join your voice channel',
  
  async execute(message, args, guildConfig) {
    // Check if user is in a voice channel
    if (!message.member.voice.channel) {
      return message.reply('You need to be in a voice channel first!');
    }

    // Check if already connected
    if (voiceService.isConnected(message.guild.id)) {
      return message.reply("I'm already in a voice channel!");
    }

    try {
      await voiceService.join(message.member.voice.channel);
      await message.react('✅');
    } catch (error) {
      console.error('Error joining voice channel:', error);
      await message.reply("I couldn't connect to your voice channel. Make sure I have the proper permissions!");
    }
  }
};