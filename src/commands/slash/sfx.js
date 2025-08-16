const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const sfxManager = require('../../services/sfxManager');
const voiceService = require('../../services/voiceService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sfx')
    .setDescription('Play a sound effect')
    .addStringOption(option =>
      option.setName('sound')
        .setDescription('The sound effect to play')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction, guildConfig) {
    // Check if SFX is allowed in this channel
    if (guildConfig.allowedSfxChannels) {
      const allowedChannels = new RegExp(guildConfig.allowedSfxChannels);
      if (!allowedChannels.test(interaction.channel.name)) {
        return interaction.reply({ 
          content: 'Sound effects are not allowed in this channel!', 
          flags: [MessageFlags.Ephemeral]
        });
      }
    }

    const sfxName = interaction.options.getString('sound');
    
    // Log the slash command SFX request
    console.log(
      `/sfx '${sfxName}' requested in ${guildConfig.internalName || interaction.guild.name}#${interaction.channel.name} from @${interaction.user.username}`
    );

    // Check if SFX exists
    if (!sfxManager.hasSFX(sfxName)) {
      return interaction.reply({ 
        content: 'This sound effect does not exist!', 
        flags: [MessageFlags.Ephemeral]
      });
    }

    // Check if user is in a voice channel
    const member = interaction.member;
    if (!member.voice.channel) {
      return interaction.reply({ 
        content: 'You need to be in a voice channel to use this command!', 
        flags: [MessageFlags.Ephemeral]
      });
    }

    // Defer the reply as joining voice might take a moment
    await interaction.deferReply();

    try {
      // Join the voice channel
      await voiceService.join(member.voice.channel);

      // Get the SFX file path
      const sfxPath = sfxManager.getSFXPath(sfxName);

      // Play the sound effect
      await voiceService.play(
        interaction.guild.id, 
        sfxPath, 
        { 
          volume: guildConfig.sfxVolume || 0.5 
        }
      );

      // Update the reply
      await interaction.editReply(`Playing sound effect: **${sfxName}**`);

      // Leave the voice channel after playing
      setTimeout(() => {
        voiceService.leave(interaction.guild.id);
      }, 500);
      
      console.log(`✅ Successfully played /sfx '${sfxName}'`);

    } catch (error) {
      console.error(`❌ Error playing /sfx '${sfxName}':`, error);
      await interaction.editReply({
        content: "I couldn't play that sound effect. Make sure I have permission to join your voice channel!"
      });
    }
  },

  async autocomplete(interaction, guildConfig) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    
    // Get all SFX names
    const choices = sfxManager.getSFXNames();
    
    // Filter based on what the user has typed
    const filtered = choices
      .filter(choice => choice.toLowerCase().includes(focusedValue))
      .slice(0, 25); // Discord limits autocomplete to 25 choices

    // Respond with the filtered choices
    await interaction.respond(
      filtered.map(choice => ({ 
        name: choice, 
        value: choice 
      }))
    );
  }
};