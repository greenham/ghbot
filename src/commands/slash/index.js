const fs = require("fs");
const path = require("path");
const { MessageFlags } = require("discord.js");

class SlashCommandHandler {
  constructor() {
    this.commands = new Map();
    this.loadCommands();
  }

  /**
   * Load all slash command modules
   */
  loadCommands() {
    const commandFiles = fs
      .readdirSync(__dirname)
      .filter((file) => file.endsWith(".js") && file !== "index.js");

    for (const file of commandFiles) {
      const command = require(path.join(__dirname, file));

      if (command.data?.name) {
        this.commands.set(command.data.name, command);
      }
    }

    console.log(`Loaded ${this.commands.size} slash commands`);
  }

  /**
   * Get slash command definitions for registration
   * @returns {Array}
   */
  getSlashCommandDefinitions() {
    return Array.from(this.commands.values()).map((cmd) => cmd.data.toJSON());
  }

  /**
   * Execute a slash command
   * @param {string} commandName
   * @param {CommandInteraction} interaction
   * @param {Object} guildConfig
   */
  async execute(commandName, interaction, guildConfig) {
    const command = this.commands.get(commandName);

    if (!command) {
      return;
    }

    try {
      await command.execute(interaction, guildConfig);
    } catch (error) {
      console.error(`Error executing slash command ${commandName}:`, error);
      throw error;
    }
  }

  /**
   * Handle autocomplete interactions
   * @param {AutocompleteInteraction} interaction
   * @param {Object} guildConfig
   */
  async handleAutocomplete(interaction, guildConfig) {
    const command = this.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
      return;
    }

    try {
      await command.autocomplete(interaction, guildConfig);
    } catch (error) {
      console.error(
        `Error handling autocomplete for ${interaction.commandName}:`,
        error
      );
    }
  }

  /**
   * Handle button interactions for soundboard
   * @param {ButtonInteraction} interaction
   * @param {Object} guildConfig
   */
  async handleButton(interaction, guildConfig) {
    if (interaction.customId.startsWith("soundboard_")) {
      const soundboardCommand = this.commands.get("soundboard");

      if (!soundboardCommand) return;

      try {
        if (interaction.customId.startsWith("soundboard_category_")) {
          await soundboardCommand.handleCategorySelection(
            interaction,
            guildConfig
          );
        } else if (interaction.customId.startsWith("soundboard_play_")) {
          await soundboardCommand.handleSoundPlay(interaction, guildConfig);
        } else if (interaction.customId === "soundboard_back") {
          // Re-execute the main soundboard command
          await soundboardCommand.execute(interaction, guildConfig);
        }
      } catch (error) {
        console.error(`Error handling soundboard button interaction:`, error);

        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "There was an error with the soundboard!",
            flags: [MessageFlags.Ephemeral],
          });
        }
      }
    }
  }
}

module.exports = new SlashCommandHandler();
