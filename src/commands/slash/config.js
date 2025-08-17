const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const configManager = require('../../config/config');

module.exports = {
  async formatAllowedRoles(guild, guildConfig) {
    const databaseService = configManager.databaseService;
    if (!databaseService) return 'Database unavailable';

    const allowedRoleIds = databaseService.getAllowedRoleIds(guild.id);
    
    if (allowedRoleIds.length === 0) {
      return 'None configured';
    }

    const roles = [];
    for (const roleId of allowedRoleIds) {
      try {
        const role = await guild.roles.fetch(roleId);
        if (role) roles.push(role.name);
      } catch (error) {
        roles.push(`<deleted role: ${roleId}>`);
      }
    }

    return roles.length > 0 ? roles.join(', ') : 'None configured';
  },

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
        .setDescription('Manage self-assignable roles')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Add role to list', value: 'add' },
              { name: 'Remove role from list', value: 'remove' },
              { name: 'Clear all roles', value: 'clear' },
              { name: 'Show current roles', value: 'list' }
            )
        )
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to add or remove (not needed for list/clear)')
            .setRequired(false)
        )
    ),

  async execute(interaction, guildConfig) {
    const subcommand = interaction.options.getSubcommand();
    const databaseService = configManager.databaseService;

    if (!databaseService) {
      return interaction.reply({ 
        content: '❌ Database service not available.', 
        flags: [MessageFlags.Ephemeral]
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
          { name: 'Self-Assignable Roles', value: await this.formatAllowedRoles(interaction.guild, guildConfig), inline: false },
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
        const action = interaction.options.getString('action');
        const role = interaction.options.getRole('role');
        
        if (action === 'list') {
          const allowedRoleIds = databaseService.getAllowedRoleIds(interaction.guild.id);
          
          if (allowedRoleIds.length === 0) {
            return interaction.reply({
              content: '❌ No self-assignable roles are currently configured.',
              flags: [MessageFlags.Ephemeral]
            });
          }

          // Get role objects from IDs
          const roles = [];
          for (const roleId of allowedRoleIds) {
            try {
              const roleObj = await interaction.guild.roles.fetch(roleId);
              if (roleObj) roles.push(roleObj);
            } catch (error) {
              console.warn(`Role ${roleId} not found in guild ${interaction.guild.id}`);
            }
          }

          const embed = new EmbedBuilder()
            .setTitle('📋 Self-Assignable Roles Configuration')
            .setDescription(roles.length > 0 ? 'Currently configured roles:' : 'No valid roles found.')
            .setColor(0x21c629)
            .addFields(roles.length > 0 ? {
              name: 'Allowed Roles',
              value: roles.map(r => `• ${r}`).join('\n'),
              inline: false
            } : {
              name: 'Status',
              value: 'No roles configured or all configured roles have been deleted.',
              inline: false
            });

          return interaction.reply({ embeds: [embed] });
        }

        if (action === 'clear') {
          databaseService.updateAllowedRoleIds(interaction.guild.id, []);
          updateMessage = 'Self-assignable roles list cleared';
          updated = true;
          break;
        }

        if (!role) {
          return interaction.reply({
            content: '❌ You must specify a role for add/remove actions.',
            flags: [MessageFlags.Ephemeral]
          });
        }

        // Check if bot can manage this role
        if (!interaction.guild.members.me.permissions.has('ManageRoles') || 
            role.position >= interaction.guild.members.me.roles.highest.position) {
          return interaction.reply({
            content: `❌ I cannot manage the **${role.name}** role due to permission hierarchy.`,
            flags: [MessageFlags.Ephemeral]
          });
        }

        if (action === 'add') {
          databaseService.addAllowedRole(interaction.guild.id, role.id);
          updateMessage = `Added **${role.name}** to self-assignable roles`;
        } else if (action === 'remove') {
          databaseService.removeAllowedRole(interaction.guild.id, role.id);
          updateMessage = `Removed **${role.name}** from self-assignable roles`;
        }

        updated = true;
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