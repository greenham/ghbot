const fs = require('fs');
const path = require('path');

class PrefixCommandHandler {
  constructor() {
    this.commands = new Map();
    this.loadCommands();
  }

  /**
   * Load all prefix command modules
   */
  loadCommands() {
    const commandFiles = fs.readdirSync(__dirname)
      .filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of commandFiles) {
      const command = require(path.join(__dirname, file));
      
      // Register command and any aliases
      if (command.name) {
        this.commands.set(command.name, command);
        
        if (command.aliases && Array.isArray(command.aliases)) {
          for (const alias of command.aliases) {
            this.commands.set(alias, command);
          }
        }
      }
    }

    console.log(`Loaded ${this.commands.size} prefix commands`);
  }

  /**
   * Check if a command exists
   * @param {string} commandName 
   * @returns {boolean}
   */
  has(commandName) {
    return this.commands.has(commandName);
  }

  /**
   * Execute a command
   * @param {string} commandName 
   * @param {Message} message 
   * @param {Array} args 
   * @param {Object} guildConfig 
   */
  async execute(commandName, message, args, guildConfig) {
    const command = this.commands.get(commandName);
    
    if (!command) {
      return;
    }

    try {
      await command.execute(message, args, guildConfig);
    } catch (error) {
      console.error(`Error executing prefix command ${commandName}:`, error);
      throw error;
    }
  }
}

module.exports = new PrefixCommandHandler();