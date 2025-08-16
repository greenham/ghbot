const fs = require('fs');
const path = require('path');
const { MessageFlags } = require('discord.js');
const voiceService = require('./voiceService');

class SFXManager {
  constructor() {
    this.sfxPath = path.join(__dirname, '..', '..', 'sfx');
    this.sfxList = [];
    this.cachedNames = [];
    this.searchCache = new Map(); // Cache for autocomplete searches
    
    // Load SFX list initially
    this.loadSFXList();
    
    // Watch for changes
    this.watchSFXDirectory();
  }

  /**
   * Load the list of available SFX files
   */
  loadSFXList() {
    try {
      if (!fs.existsSync(this.sfxPath)) {
        console.log('SFX directory not found, creating...');
        fs.mkdirSync(this.sfxPath, { recursive: true });
      }

      const files = fs.readdirSync(this.sfxPath);
      this.sfxList = files
        .filter(file => file.endsWith('.mp3') || file.endsWith('.wav'))
        .map(file => {
          const ext = path.extname(file);
          return {
            name: file.replace(ext, ''),
            filename: file,
            path: path.join(this.sfxPath, file)
          };
        });
      
      // Cache sorted names for autocomplete
      this.cachedNames = this.sfxList
        .map(sfx => sfx.name)
        .sort((a, b) => a.localeCompare(b));
      
      // Clear search cache when SFX list changes
      this.searchCache.clear();
      
      console.log(`Loaded ${this.sfxList.length} sound effects`);
    } catch (error) {
      console.error('Error loading SFX list:', error);
    }
  }

  /**
   * Watch the SFX directory for changes
   */
  watchSFXDirectory() {
    fs.watch(this.sfxPath, (eventType, filename) => {
      if (eventType === 'rename') {
        console.log('SFX directory changed, reloading...');
        this.loadSFXList();
      }
    });
  }

  /**
   * Get all available SFX
   * @returns {Array} List of SFX objects
   */
  getAllSFX() {
    return this.sfxList;
  }

  /**
   * Get SFX names for autocomplete (cached and sorted)
   * @returns {Array} List of SFX names
   */
  getSFXNames() {
    return this.cachedNames;
  }

  /**
   * Find an SFX by name
   * @param {string} name 
   * @returns {Object|undefined} SFX object or undefined
   */
  findSFX(name) {
    return this.sfxList.find(sfx => sfx.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Check if an SFX exists
   * @param {string} name 
   * @returns {boolean}
   */
  hasSFX(name) {
    return this.findSFX(name) !== undefined;
  }

  /**
   * Get the file path for an SFX
   * @param {string} name 
   * @returns {string|null}
   */
  getSFXPath(name) {
    const sfx = this.findSFX(name);
    return sfx ? sfx.path : null;
  }

  /**
   * Search SFX names (for autocomplete) with caching
   * @param {string} query 
   * @returns {Array} Matching SFX names
   */
  searchSFX(query) {
    const lowerQuery = query.toLowerCase();
    
    // Check cache first
    if (this.searchCache.has(lowerQuery)) {
      return this.searchCache.get(lowerQuery);
    }
    
    // Perform search on cached names (already sorted)
    const results = this.cachedNames
      .filter(name => name.toLowerCase().includes(lowerQuery))
      .slice(0, 25); // Discord autocomplete limit
    
    // Cache the result for future use
    this.searchCache.set(lowerQuery, results);
    
    return results;
  }

  /**
   * Play a sound effect via interaction (slash commands and soundboard)
   * @param {Object} interaction - Discord interaction object
   * @param {string} sfxName - Name of the sound effect to play
   * @param {Object} guildConfig - Guild configuration
   * @param {string} commandType - Type of command ('slash' or 'soundboard')
   * @returns {Promise<void>}
   */
  async playSFXInteraction(interaction, sfxName, guildConfig, commandType = 'slash') {
    // Log the request
    const logPrefix = commandType === 'soundboard' ? 'Soundboard' : '/sfx';
    console.log(
      `${logPrefix} '${sfxName}' requested in ${guildConfig.internalName || interaction.guild.name}#${interaction.channel.name} from @${interaction.user.username}`
    );

    // Check if SFX exists
    if (!this.hasSFX(sfxName)) {
      await interaction.reply({
        content: `❌ This sound effect does not exist!`,
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    try {
      // Immediately reply with playing status
      await interaction.reply({
        content: `🔊 Playing: **${sfxName}**`,
        flags: [MessageFlags.Ephemeral]
      });

      // Join the voice channel
      await voiceService.join(interaction.member.voice.channel);

      // Get the SFX file path and play
      const sfxPath = this.getSFXPath(sfxName);
      await voiceService.play(interaction.guild.id, sfxPath, {
        volume: guildConfig.sfxVolume || 0.5,
      });

      // Update the interaction to show completion
      try {
        await interaction.editReply({
          content: `✅ Finished playing: **${sfxName}**`
        });
      } catch (editError) {
        console.error('Error updating interaction with completion message:', editError);
      }

      // Leave the voice channel after playing
      setTimeout(() => {
        voiceService.leave(interaction.guild.id);
      }, 500);

      console.log(`✅ Successfully played ${logPrefix.toLowerCase()} '${sfxName}'`);

    } catch (error) {
      console.error(`❌ Error playing ${logPrefix.toLowerCase()} '${sfxName}':`, error);
      
      // Update the reply with error message
      try {
        await interaction.editReply({
          content: "❌ Couldn't play that sound effect. Make sure I have permission to join your voice channel!"
        });
      } catch (editError) {
        console.error('Error updating interaction with error message:', editError);
      }
    }
  }

  /**
   * Play a sound effect via message (prefix commands)
   * @param {Object} message - Discord message object
   * @param {string} sfxName - Name of the sound effect to play
   * @param {Object} guildConfig - Guild configuration
   * @returns {Promise<void>}
   */
  async playSFXMessage(message, sfxName, guildConfig) {
    // Log the request
    console.log(
      `SFX '${sfxName}' requested in ${guildConfig.internalName || message.guild.name}#${message.channel.name} from @${message.author.username}`
    );

    // Check if SFX exists
    if (!this.hasSFX(sfxName)) {
      await message.reply('❌ This sound effect does not exist!');
      return;
    }

    try {
      // Join the voice channel
      await voiceService.join(message.member.voice.channel);

      // Get the SFX file path and play
      const sfxPath = this.getSFXPath(sfxName);
      await voiceService.play(message.guild.id, sfxPath, {
        volume: guildConfig.sfxVolume || 0.5,
      });

      // Leave the voice channel after playing
      setTimeout(() => {
        voiceService.leave(message.guild.id);
      }, 500);

      console.log(`✅ Successfully played SFX '${sfxName}'`);

    } catch (error) {
      console.error(`❌ Error playing SFX '${sfxName}':`, error);
      await message.reply("❌ Couldn't play that sound effect. Make sure I have permission to join your voice channel!");
    }
  }
}

module.exports = new SFXManager();