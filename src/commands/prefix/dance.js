module.exports = {
  name: 'dance',
  description: 'Make the bot dance!',
  
  async execute(message, args, guildConfig) {
    await message.channel.send(
      '*┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛ ┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛ ┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛ ┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛*'
    );
  }
};