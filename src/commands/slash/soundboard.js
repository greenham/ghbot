const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const sfxManager = require("../../services/sfxManager");
const voiceService = require("../../services/voiceService");

// Parse categories from README.md
function getSFXCategories() {
  try {
    const sfxReadmePath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "sfx",
      "README.md"
    );

    if (!fs.existsSync(sfxReadmePath)) {
      return null;
    }

    const content = fs.readFileSync(sfxReadmePath, "utf-8");
    const categories = {};

    // Parse categories and their sounds
    const lines = content.split("\n");
    let currentCategory = null;

    for (const line of lines) {
      const headerMatch = line.match(/^\*\*([^*]+)\*\*$/);
      if (headerMatch) {
        currentCategory = headerMatch[1];
        categories[currentCategory] = [];
      } else if (currentCategory && line.trim() && !line.startsWith("```")) {
        // Parse comma-separated sounds from the line
        const sounds = line
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        categories[currentCategory].push(...sounds);
      }
    }

    return categories;
  } catch (error) {
    console.error("Error parsing SFX categories:", error);
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("soundboard")
    .setDescription("Interactive soundboard with categorized buttons"),

  async execute(interaction, guildConfig) {
    // Check if SFX is allowed in this channel
    if (guildConfig.allowedSfxChannels) {
      const allowedChannels = new RegExp(guildConfig.allowedSfxChannels);
      if (!allowedChannels.test(interaction.channel.name)) {
        return interaction.reply({
          content: "Sound effects are not allowed in this channel!",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }

    // Check if user is in a voice channel
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        content: "You need to be in a voice channel to use the soundboard!",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const categories = getSFXCategories();

    if (!categories) {
      return interaction.reply({
        content:
          "Soundboard not available - SFX categories could not be loaded.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Create category selection buttons (4 per row for better layout)
    const categoryNames = Object.keys(categories);
    const rows = [];

    for (let i = 0; i < categoryNames.length; i += 4) {
      const row = new ActionRowBuilder();
      const categoriesInRow = categoryNames.slice(i, i + 4);

      for (const category of categoriesInRow) {
        const button = new ButtonBuilder()
          .setCustomId(
            `soundboard_category_${category
              .toLowerCase()
              .replace(/\s+/g, "_")
              .replace(/&/g, "and")}`
          )
          .setLabel(
            category.length > 80 ? category.substring(0, 77) + "..." : category
          )
          .setStyle(ButtonStyle.Primary);

        row.addComponents(button);
      }

      if (row.components.length > 0) {
        rows.push(row);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🎛️ Interactive Soundboard")
      .setDescription("Choose a category to browse sound effects:")
      .setColor(0x21c629)
      .setFooter({ text: "Click a category button to browse sounds" });

    await interaction.reply({
      embeds: [embed],
      components: rows,
    });
  },

  async handleCategorySelection(interaction, guildConfig) {
    const customId = interaction.customId;
    let categoryKey,
      page = 0;

    if (customId.includes("_page_")) {
      // Handle pagination: soundboard_category_general_page_1
      const parts = customId
        .replace("soundboard_category_", "")
        .split("_page_");
      categoryKey = parts[0]
        .replace(/_/g, " ")
        .replace(/and/g, "&")
        .toUpperCase();
      page = parseInt(parts[1]) || 0;
    } else {
      // Handle initial category selection
      categoryKey = customId
        .replace("soundboard_category_", "")
        .replace(/_/g, " ")
        .replace(/and/g, "&")
        .toUpperCase();
    }

    const categories = getSFXCategories();

    if (!categories || !categories[categoryKey]) {
      return interaction.reply({
        content: "Category not found!",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const allSounds = categories[categoryKey].filter((sound) =>
      sfxManager.hasSFX(sound)
    );
    const soundsPerPage = 16; // 4 sounds per row × 4 rows = 16 sounds per page
    const totalPages = Math.ceil(allSounds.length / soundsPerPage);
    const startIndex = page * soundsPerPage;
    const sounds = allSounds.slice(startIndex, startIndex + soundsPerPage);

    const rows = [];
    let buttonCount = 0;

    // Create sound buttons (4 per row, 4 rows for sounds + 1 for navigation = 16 sound buttons max)
    for (let i = 0; i < sounds.length && rows.length < 4; i += 4) {
      const row = new ActionRowBuilder();
      const soundsInRow = sounds.slice(i, i + 4);

      for (const sound of soundsInRow) {
        if (buttonCount >= 16) break; // Leave room for navigation row

        const button = new ButtonBuilder()
          .setCustomId(`soundboard_play_${sound}`)
          .setLabel(sound.length > 80 ? sound.substring(0, 77) + "..." : sound)
          .setStyle(ButtonStyle.Secondary);

        row.addComponents(button);
        buttonCount++;
      }

      if (row.components.length > 0) {
        rows.push(row);
      }
    }

    // Add navigation row with back button and pagination if needed
    const navRow = new ActionRowBuilder();

    // Add previous page button if not on first page
    if (page > 0) {
      const prevButton = new ButtonBuilder()
        .setCustomId(
          `soundboard_category_${categoryKey
            .toLowerCase()
            .replace(/\s+/g, "_")}_page_${page - 1}`
        )
        .setLabel("« Previous")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("◀️");
      navRow.addComponents(prevButton);
    }

    // Add back to categories button
    const backButton = new ButtonBuilder()
      .setCustomId("soundboard_back")
      .setLabel("Back to Categories")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔙");
    navRow.addComponents(backButton);

    // Add next page button if there are more pages
    if (page < totalPages - 1) {
      const nextButton = new ButtonBuilder()
        .setCustomId(
          `soundboard_category_${categoryKey
            .toLowerCase()
            .replace(/\s+/g, "_")}_page_${page + 1}`
        )
        .setLabel("Next »")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("▶️");
      navRow.addComponents(nextButton);
    }

    rows.push(navRow);

    // Show pagination info
    const paginationNote =
      totalPages > 1
        ? `\n\n*Page ${page + 1} of ${totalPages} (${
            allSounds.length
          } total sounds)*`
        : "";

    const embed = new EmbedBuilder()
      .setTitle(`${categoryKey} Soundboard`)
      .setDescription(`Choose a sound effect to play:${paginationNote}`)
      .setColor(0x21c629)
      .setFooter({ text: "Click a sound button to play it" });

    await interaction.update({
      embeds: [embed],
      components: rows,
    });
  },

  async handleSoundPlay(interaction, guildConfig) {
    const soundName = interaction.customId.replace("soundboard_play_", "");

    // Use the reusable SFX playing method
    await sfxManager.playSFXInteraction(
      interaction,
      soundName,
      guildConfig,
      "soundboard"
    );
  },
};
