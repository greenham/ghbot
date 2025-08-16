module.exports = {
  name: 'role',
  description: 'Add or remove allowed roles',
  
  async execute(message, args, guildConfig) {
    // Check if there are allowed roles configured
    if (!guildConfig.allowedRolesForRequest || guildConfig.allowedRolesForRequest.length === 0) {
      return message.reply('No roles are currently allowed to be added/removed by members.');
    }

    // Show usage if no arguments
    if (args.length === 0) {
      return message.reply(
        `Usage: ${guildConfig.prefix}role {add|remove} {${guildConfig.allowedRolesForRequest}}`
      );
    }

    const action = args[0]?.toLowerCase();
    const roleName = args.slice(1).join(' ');

    // Validate action
    if (!['add', 'remove'].includes(action)) {
      return message.reply(
        `You must use add/remove after the role command! *e.g. ${guildConfig.prefix}role add <rolename>*`
      );
    }

    // Validate role name
    if (!roleName) {
      return message.reply(
        `Usage: ${guildConfig.prefix}role {add|remove} {${guildConfig.allowedRolesForRequest}}`
      );
    }

    // Check if role is in the allowed list
    const allowedRoles = guildConfig.allowedRolesForRequest.split('|');
    const roleRegex = new RegExp(guildConfig.allowedRolesForRequest, 'i');
    
    if (!roleRegex.test(roleName)) {
      return message.reply(
        `**${roleName}** is not a valid role name! The roles allowed for request are: ${allowedRoles.join(', ')}`
      );
    }

    // Find the role in the guild (case-sensitive search)
    const role = message.guild.roles.cache.find(r => 
      r.name.toLowerCase() === roleName.toLowerCase()
    );

    if (!role) {
      return message.reply(`${roleName} is not a role on this server!`);
    }

    try {
      if (action === 'add') {
        await message.member.roles.add(role, 'User requested');
        await message.react('👍');
        console.log(`Added role ${role.name} to ${message.author.username}`);
      } else if (action === 'remove') {
        await message.member.roles.remove(role, 'User requested');
        await message.react('👍');
        console.log(`Removed role ${role.name} from ${message.author.username}`);
      }
    } catch (error) {
      console.error(`Error managing role ${role.name}:`, error);
      await message.react('⚠️');
      
      // Send error message if we can't react
      if (!message.reactions.cache.has('⚠️')) {
        await message.reply('I encountered an error managing that role. Make sure I have the proper permissions!');
      }
    }
  }
};