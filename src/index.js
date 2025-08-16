const {
  Client,
  Events,
  EmbedBuilder,
  REST,
  Routes,
  ActivityType,
} = require("discord.js");
const { generateDependencyReport } = require("@discordjs/voice");
const intents = require("./config/intents");
const config = require("./config/config");
const { randElement } = require("./utils/helpers");

// Log audio dependencies status
console.log("Audio Dependencies Status:");
console.log(generateDependencyReport());

// Initialize Discord client
const client = new Client({ intents });

// Services
const commandLoader = require("./services/commandLoader");
const schedulerService = require("./services/schedulerService");

// Command handlers
const prefixCommands = require("./commands/prefix");
const slashCommands = require("./commands/slash");

// Activity rotation
let activityInterval;

/**
 * Set a random activity for the bot
 */
function setRandomActivity() {
  const activity =
    config.discord.activities?.length > 0
      ? randElement(config.discord.activities)
      : "DESTROY ALL HUMANS";

  console.log(`Setting Discord activity to: ${activity}`);

  client.user.setActivity(activity, {
    url: "https://twitch.tv/fgfm",
    type: ActivityType.Streaming,
  });
}

/**
 * Register slash commands
 */
async function registerSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(config.discord.token);

  try {
    console.log("Started refreshing application (/) commands.");

    // Get all slash command definitions
    const commands = slashCommands.getSlashCommandDefinitions();

    // Register commands for each guild
    for (const guild of config.discord.guilds) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );
      console.log(
        `Registered slash commands for guild: ${guild.internalName || guild.id}`
      );
    }

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Error registering slash commands:", error);
  }
}

// Client ready event
client.once(Events.ClientReady, async () => {
  console.log(`✅ ${config.botName} is connected and ready!`);
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} guild(s)`);

  // Set initial activity
  setRandomActivity();

  // Rotate activity every hour
  activityInterval = setInterval(() => {
    setRandomActivity();
  }, 3600 * 1000);

  // Register slash commands
  await registerSlashCommands();

  // Initialize scheduled events
  schedulerService.initialize(client, config);
});

// Message handler for prefix commands
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Ignore DMs if not configured
  if (!message.guild) return;

  // Check if guild is configured
  const guildConfig = config.discord.guilds.find(
    (g) => g.id === message.guild.id
  );
  if (!guildConfig) return;

  // Check blacklist
  if (config.discord.blacklistedUsers?.includes(message.author.id)) return;

  // Check for command prefix
  if (!message.content.startsWith(guildConfig.prefix)) return;

  // Parse command
  const args = message.content
    .slice(guildConfig.prefix.length)
    .trim()
    .split(/ +/);
  const commandName = args.shift().toLowerCase();

  console.log(
    `Command '${commandName}' received in ${
      guildConfig.internalName || message.guild.name
    }#${message.channel.name} from @${message.author.username}`
  );

  try {
    // Check for prefix commands
    if (prefixCommands.has(commandName)) {
      await prefixCommands.execute(commandName, message, args, guildConfig);
      return;
    }

    // Check for static commands
    if (commandLoader.hasStaticCommand(commandName)) {
      const response = commandLoader.getStaticCommand(commandName);
      const embed = new EmbedBuilder()
        .setTitle(commandName)
        .setColor(0x21c629)
        .setDescription(response);

      await message.channel.send({ embeds: [embed] });
      return;
    }

    // Check for Ankhbot commands
    if (commandLoader.hasAnkhbotCommand(commandName)) {
      const response = commandLoader.getAnkhbotCommand(commandName);
      const embed = new EmbedBuilder()
        .setTitle(commandName)
        .setColor(0x21c629)
        .setDescription(response);

      await message.channel.send({ embeds: [embed] });
      return;
    }

    // Command not found - ignore silently
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    message
      .reply("There was an error executing that command!")
      .catch(console.error);
  }
});

// Interaction handler for slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isAutocomplete())
    return;

  // Get guild config
  const guildConfig = config.discord.guilds.find(
    (g) => g.id === interaction.guild.id
  );
  if (!guildConfig) return;

  try {
    if (interaction.isAutocomplete()) {
      await slashCommands.handleAutocomplete(interaction, guildConfig);
    } else if (interaction.isChatInputCommand()) {
      await slashCommands.execute(
        interaction.commandName,
        interaction,
        guildConfig
      );
    }
  } catch (error) {
    console.error("Error handling interaction:", error);

    if (interaction.isChatInputCommand() && !interaction.replied) {
      await interaction
        .reply({
          content: "There was an error executing this command!",
          ephemeral: true,
        })
        .catch(console.error);
    }
  }
});

// Handle new guild members
client.on(Events.GuildMemberAdd, (member) => {
  // Check if guild is configured
  const guildConfig = config.discord.guilds.find(
    (g) => g.id === member.guild.id
  );
  if (!guildConfig) return;

  console.log(
    `A new member has joined '${member.guild.name}': ${member.displayName}`
  );
});

// Handle guild becoming unavailable
client.on(Events.GuildUnavailable, (guild) => {
  console.log(
    `Guild '${guild.name}' is no longer available! Most likely due to server outage.`
  );
});

// Debug logging
client.on("debug", (info) => {
  if (config.debug === true) {
    console.log(`[${new Date().toISOString()}] DEBUG: ${info}`);
  }
});

// Error handling
client.on("error", console.error);

// Process error handling
process.on("unhandledRejection", console.error);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received, shutting down gracefully...");

  if (activityInterval) {
    clearInterval(activityInterval);
  }

  client.destroy();
  process.exit(0);
});

// Login to Discord
client.login(config.discord.token);
