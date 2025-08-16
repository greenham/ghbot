const axios = require('axios');
const { chunkSubstr } = require('../../utils/helpers');
const sfxManager = require('../../services/sfxManager');
const voiceService = require('../../services/voiceService');

module.exports = {
  name: 'sfx',
  description: 'Play a sound effect',

  /**
   * Smart chunking that respects markdown block boundaries
   * @param {string} content 
   * @param {number} maxLength 
   * @returns {Array<string>}
   */
  smartChunkMarkdown(content, maxLength) {
    const chunks = [];
    const sections = content.split(/(\*\*[^*]+\*\*)/); // Split on headers while keeping them
    
    let currentChunk = '';
    
    for (const section of sections) {
      // If adding this section would exceed the limit
      if (currentChunk.length + section.length > maxLength) {
        // Save current chunk if it has content
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = section;
      } else {
        currentChunk += section;
      }
    }
    
    // Add the final chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  },
  
  async execute(message, args, guildConfig) {
    // Check if SFX is allowed in this channel
    if (guildConfig.allowedSfxChannels) {
      const allowedChannels = new RegExp(guildConfig.allowedSfxChannels);
      if (!allowedChannels.test(message.channel.name)) {
        return;
      }
    }

    const sfxName = args[0];

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
            // Smart chunking that respects markdown block boundaries
            const chunks = this.smartChunkMarkdown(sfxListContent, 1900);
            
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

    // Check if user is in a voice channel
    if (!message.member.voice.channel) {
      return message.reply('You need to be in a voice channel to use this command!');
    }

    // Use the reusable SFX playing method for messages
    await sfxManager.playSFXMessage(message, sfxName, guildConfig);
  }
};