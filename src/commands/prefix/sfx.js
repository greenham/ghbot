const axios = require('axios');
const { chunkSubstr } = require('../../utils/helpers');
const sfxManager = require('../../services/sfxManager');
const voiceService = require('../../services/voiceService');

module.exports = {
  name: 'sfx',
  description: 'Play a sound effect',
  
  async execute(message, args, guildConfig) {
    // Check if SFX is allowed in this channel
    if (guildConfig.allowedSfxChannels) {
      const allowedChannels = new RegExp(guildConfig.allowedSfxChannels);
      if (!allowedChannels.test(message.channel.name)) {
        return;
      }
    }

    const sfxName = args[0];
    
    // Log the SFX command
    if (sfxName) {
      console.log(
        `SFX '${sfxName}' requested in ${guildConfig.internalName || message.guild.name}#${message.channel.name} from @${message.author.username}`
      );
    }

    // If no SFX specified, show the list
    if (!sfxName) {
      try {
        const fs = require('fs');
        const path = require('path');
        const sfxReadmePath = path.join(__dirname, '..', '..', '..', 'sfx', 'README.md');
        
        if (fs.existsSync(sfxReadmePath)) {
          const sfxListContent = fs.readFileSync(sfxReadmePath, 'utf-8');
          
          // Break into chunks if too long (Discord limit is 2000 characters)
          if (sfxListContent.length <= 2000) {
            await message.channel.send(sfxListContent);
          } else {
            const chunks = chunkSubstr(sfxListContent, 1900); // Leave some buffer
            
            for (const chunk of chunks) {
              await message.channel.send(chunk);
            }
          }
        } else {
          // Fallback to generated list if README doesn't exist
          const sfxNames = sfxManager.getSFXNames();
          const sfxList = `**Available Sound Effects (${sfxNames.length}):**\n\`\`\`\n${sfxNames.join(', ')}\n\`\`\``;
          await message.channel.send(sfxList);
        }
      } catch (error) {
        console.error('Error reading SFX list:', error);
        await message.reply('Could not load the SFX list.');
      }
      return;
    }

    // Check if SFX exists
    if (!sfxManager.hasSFX(sfxName)) {
      return message.reply('This sound effect does not exist!');
    }

    // Check if user is in a voice channel
    if (!message.member.voice.channel) {
      return message.reply('You need to be in a voice channel to use this command!');
    }

    try {
      // Join the voice channel
      await voiceService.join(message.member.voice.channel);

      // Get the SFX file path
      const sfxPath = sfxManager.getSFXPath(sfxName);

      // Play the sound effect
      await voiceService.play(
        message.guild.id, 
        sfxPath, 
        { 
          volume: guildConfig.sfxVolume || 0.5 
        }
      );

      // Leave the voice channel after playing
      setTimeout(() => {
        voiceService.leave(message.guild.id);
      }, 500);
      
      console.log(`✅ Successfully played SFX '${sfxName}'`);

    } catch (error) {
      console.error(`❌ Error playing SFX '${sfxName}':`, error);
      await message.reply("I couldn't play that sound effect. Make sure I have permission to join your voice channel!");
    }
  }
};