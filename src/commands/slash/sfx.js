const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const sfxManager = require("../../services/sfxManager");
const voiceService = require("../../services/voiceService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sfx")
    .setDescription("Play a sound effect")
    .addStringOption((option) =>
      option
        .setName("sound")
        .setDescription("The sound effect to play")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction, guildConfig) {
    const sfxName = interaction.options.getString("sound");

    // Check if user is in a voice channel
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        content: "You need to be in a voice channel to use this command!",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Use the reusable SFX playing method
    await sfxManager.playSfxInteraction(
      interaction,
      sfxName,
      guildConfig,
      "slash"
    );
  },

  async autocomplete(interaction, guildConfig) {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    // Get all SFX names
    const choices = sfxManager.getSfxNames();

    // Filter based on what the user has typed
    const filtered = choices
      .filter((choice) => choice.toLowerCase().includes(focusedValue))
      .slice(0, 25); // Discord limits autocomplete to 25 choices

    // Respond with the filtered choices
    await interaction.respond(
      filtered.map((choice) => ({
        name: choice,
        value: choice,
      }))
    );
  },
};
