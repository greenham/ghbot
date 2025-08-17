const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const configManager = require('../../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage your roles')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a role to yourself')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to add')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a role from yourself')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to remove')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Show available self-assignable roles')
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

    // Get allowed role IDs for this guild
    const allowedRoleIds = databaseService.getAllowedRoleIds(interaction.guild.id);

    if (subcommand === 'list') {
      if (allowedRoleIds.length === 0) {
        return interaction.reply({
          content: '❌ No roles are currently available for self-assignment on this server.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Get role objects from IDs
      const roles = [];
      for (const roleId of allowedRoleIds) {
        try {
          const role = await interaction.guild.roles.fetch(roleId);
          if (role) {
            roles.push(role);
          }
        } catch (error) {
          console.warn(`Role ${roleId} not found in guild ${interaction.guild.id}`);
        }
      }

      if (roles.length === 0) {
        return interaction.reply({
          content: '❌ No valid self-assignable roles found. The configured roles may have been deleted.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Available Self-Assignable Roles')
        .setDescription('You can add or remove these roles using `/role add` or `/role remove`:')
        .setColor(0x21c629)
        .addFields({
          name: 'Available Roles',
          value: roles.map(role => `• ${role}`).join('\n'),
          inline: false
        })
        .setFooter({ text: 'Use /role add or /role remove to manage your roles' });

      return interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral]
      });
    }

    // Handle add/remove subcommands
    const targetRole = interaction.options.getRole('role');

    // Check if the role is in the allowed list
    if (!allowedRoleIds.includes(targetRole.id)) {
      return interaction.reply({
        content: `❌ **${targetRole.name}** is not available for self-assignment. Use \`/role list\` to see available roles.`,
        flags: [MessageFlags.Ephemeral]
      });
    }

    // Check if bot can manage this role
    if (!interaction.guild.members.me.permissions.has('ManageRoles') || 
        targetRole.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({
        content: `❌ I don't have permission to manage the **${targetRole.name}** role. Please contact an administrator.`,
        flags: [MessageFlags.Ephemeral]
      });
    }

    try {
      if (subcommand === 'add') {
        // Check if user already has the role
        if (interaction.member.roles.cache.has(targetRole.id)) {
          return interaction.reply({
            content: `❌ You already have the **${targetRole.name}** role.`,
            flags: [MessageFlags.Ephemeral]
          });
        }

        await interaction.member.roles.add(targetRole, 'User requested via slash command');

        const embed = new EmbedBuilder()
          .setTitle('✅ Role Added')
          .setDescription(`Successfully added the **${targetRole.name}** role to your account.`)
          .setColor(0x00ff00)
          .setFooter({ text: 'Use /role remove to remove roles' });

        await interaction.reply({
          embeds: [embed],
          flags: [MessageFlags.Ephemeral]
        });

        console.log(`Added role ${targetRole.name} to ${interaction.user.username} in ${interaction.guild.name}`);

      } else if (subcommand === 'remove') {
        // Check if user has the role
        if (!interaction.member.roles.cache.has(targetRole.id)) {
          return interaction.reply({
            content: `❌ You don't have the **${targetRole.name}** role.`,
            flags: [MessageFlags.Ephemeral]
          });
        }

        await interaction.member.roles.remove(targetRole, 'User requested via slash command');

        const embed = new EmbedBuilder()
          .setTitle('✅ Role Removed')
          .setDescription(`Successfully removed the **${targetRole.name}** role from your account.`)
          .setColor(0x00ff00)
          .setFooter({ text: 'Use /role add to add roles' });

        await interaction.reply({
          embeds: [embed],
          flags: [MessageFlags.Ephemeral]
        });

        console.log(`Removed role ${targetRole.name} from ${interaction.user.username} in ${interaction.guild.name}`);
      }

    } catch (error) {
      console.error(`Error managing role ${targetRole.name}:`, error);

      const embed = new EmbedBuilder()
        .setTitle('❌ Role Management Error')
        .setDescription(`I encountered an error managing the **${targetRole.name}** role. Please contact an administrator.`)
        .setColor(0xff0000)
        .addFields({
          name: 'Possible Issues',
          value: '• Bot lacks Manage Roles permission\n• Role is higher than bot\'s highest role\n• Role is managed by an integration',
          inline: false
        });

      await interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};