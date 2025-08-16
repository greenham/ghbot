const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const configManager = require('../../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Manage server configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Show current server configuration')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('prefix')
        .setDescription('Set the command prefix')
        .addStringOption(option =>
          option.setName('new_prefix')
            .setDescription('The new command prefix')
            .setRequired(true)
            .setMaxLength(5)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sfx')
        .setDescription('Enable or disable sound effects')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable sound effects')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('volume')
        .setDescription('Set sound effects volume')
        .addNumberOption(option =>
          option.setName('level')
            .setDescription('Volume level (0.1 to 1.0)')
            .setRequired(true)
            .setMinValue(0.1)
            .setMaxValue(1.0)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('funfacts')
        .setDescription('Enable or disable fun facts')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable fun facts')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('hamfacts')
        .setDescription('Enable or disable ham facts')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable ham facts')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sfxchannels')
        .setDescription('Set allowed channels for sound effects (regex pattern)')
        .addStringOption(option =>
          option.setName('pattern')
            .setDescription('Channel name pattern (leave empty to allow all channels)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('roles')
        .setDescription('Set roles that users can self-assign')
        .addStringOption(option =>
          option.setName('pattern')
            .setDescription('Role pattern (pipe-separated, e.g., "streamer|vip|member")')
            .setRequired(false)
        )
    ),

  async execute(interaction, guildConfig) {
    const subcommand = interaction.options.getSubcommand();
    const databaseService = configManager.databaseService;

    if (!databaseService) {
      return interaction.reply({ 
        content: '❌ Database service not available.', 
        ephemeral: true 
      });
    }

    if (subcommand === 'show') {
      const embed = new EmbedBuilder()
        .setTitle(`⚙️ Configuration for ${interaction.guild.name}`)
        .setColor(0x21c629)
        .addFields([
          { name: 'Prefix', value: `\`${guildConfig.prefix}\``, inline: true },
          { name: 'SFX Enabled', value: guildConfig.enableSfx ? '✅ Yes' : '❌ No', inline: true },
          { name: 'SFX Volume', value: `${Math.round(guildConfig.sfxVolume * 100)}%`, inline: true },
          { name: 'Fun Facts', value: guildConfig.enableFunFacts ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Ham Facts', value: guildConfig.enableHamFacts ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Allowed SFX Channels', value: guildConfig.allowedSfxChannels || 'All channels', inline: false },
          { name: 'Allowed Roles', value: guildConfig.allowedRolesForRequest || 'None configured', inline: false },
        ])
        .setFooter({ text: 'Use /config commands to modify settings' });

      return interaction.reply({ embeds: [embed] });
    }

    // Handle configuration updates
    const newConfig = { ...guildConfig };
    let updateMessage = '';

    switch (subcommand) {
      case 'prefix':
        const newPrefix = interaction.options.getString('new_prefix');
        newConfig.prefix = newPrefix;
        updateMessage = `Command prefix updated to \`${newPrefix}\``;
        break;

      case 'sfx':
        const sfxEnabled = interaction.options.getBoolean('enabled');
        newConfig.enableSfx = sfxEnabled;
        updateMessage = `Sound effects ${sfxEnabled ? 'enabled' : 'disabled'}`;
        break;

      case 'volume':
        const volume = interaction.options.getNumber('level');
        newConfig.sfxVolume = volume;
        updateMessage = `SFX volume set to ${Math.round(volume * 100)}%`;
        break;

      case 'funfacts':
        const funfactsEnabled = interaction.options.getBoolean('enabled');
        newConfig.enableFunFacts = funfactsEnabled;
        updateMessage = `Fun facts ${funfactsEnabled ? 'enabled' : 'disabled'}`;
        break;

      case 'hamfacts':
        const hamfactsEnabled = interaction.options.getBoolean('enabled');
        newConfig.enableHamFacts = hamfactsEnabled;
        updateMessage = `Ham facts ${hamfactsEnabled ? 'enabled' : 'disabled'}`;
        break;

      case 'sfxchannels':
        const channelPattern = interaction.options.getString('pattern');
        newConfig.allowedSfxChannels = channelPattern || null;
        updateMessage = channelPattern 
          ? `SFX channels restricted to pattern: \`${channelPattern}\``
          : 'SFX allowed in all channels';
        break;

      case 'roles':
        const rolePattern = interaction.options.getString('pattern');
        newConfig.allowedRolesForRequest = rolePattern || null;
        updateMessage = rolePattern 
          ? `Self-assignable roles set to: \`${rolePattern}\``
          : 'Self-assignable roles cleared';
        break;
    }

    // Update configuration in database
    databaseService.upsertGuildConfig(newConfig);
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration Updated')
      .setColor(0x00ff00)
      .setDescription(updateMessage)
      .setFooter({ text: 'Use /config show to see all settings' });

    await interaction.reply({ embeds: [embed] });
    
    console.log(`Configuration updated for ${interaction.guild.name}: ${subcommand} by @${interaction.user.username}`);
  }
};