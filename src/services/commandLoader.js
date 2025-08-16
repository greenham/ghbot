const fs = require('fs');
const path = require('path');

class CommandLoader {
  constructor() {
    this.staticCommands = {};
    this.ankhbotCommands = {};
    
    // Paths to command files
    this.staticCommandsPath = path.join(__dirname, '..', '..', 'conf', 'text_commands');
    this.ankhbotCommandsPath = path.join(__dirname, '..', '..', 'conf', 'ghbot.abcomg');
    
    // Load commands initially
    this.loadStaticCommands();
    this.loadAnkhbotCommands();
    
    // Watch for changes
    this.watchFiles();
  }

  /**
   * Load static text commands from file
   */
  loadStaticCommands() {
    try {
      if (!fs.existsSync(this.staticCommandsPath)) {
        console.log('Static commands file not found, skipping...');
        return;
      }

      const data = fs.readFileSync(this.staticCommandsPath, 'utf-8');
      const lines = data.toString().split('\n');
      const commands = {};

      lines.forEach(line => {
        if (line.length > 0 && line.indexOf('|') !== -1) {
          const parts = line.split('|');
          // Check for aliases (comma-separated)
          const aliases = parts[0].split(',');
          aliases.forEach(cmd => {
            commands[cmd.trim()] = parts[1];
          });
        }
      });

      this.staticCommands = commands;
      console.log(`Loaded ${Object.keys(commands).length} static commands`);
    } catch (error) {
      console.error('Error loading static commands:', error);
    }
  }

  /**
   * Load Ankhbot commands from file
   */
  loadAnkhbotCommands() {
    try {
      if (!fs.existsSync(this.ankhbotCommandsPath)) {
        console.log('Ankhbot commands file not found, skipping...');
        return;
      }

      const data = fs.readFileSync(this.ankhbotCommandsPath, 'utf-8');
      
      // Try to parse as JSON first, fall back to eval if needed (for legacy format)
      let commands;
      try {
        commands = JSON.parse(data);
      } catch {
        // Legacy format might use JavaScript object notation
        // Create a safer evaluation context
        const sandbox = { commands: null };
        const script = `commands = ${data}`;
        try {
          // Use Function constructor for safer eval
          new Function('commands', script).call(sandbox, sandbox);
          commands = sandbox.commands;
        } catch (e) {
          console.error('Failed to parse Ankhbot commands:', e);
          return;
        }
      }

      // Convert to a map for easier lookup
      const commandMap = {};
      if (Array.isArray(commands)) {
        commands.forEach(cmd => {
          if (cmd.Enabled === true && cmd.Command && cmd.Response) {
            // Remove prefix from command name for storage
            const cmdName = cmd.Command.startsWith('!') ? 
              cmd.Command.substring(1) : cmd.Command;
            commandMap[cmdName] = cmd.Response;
          }
        });
      }

      this.ankhbotCommands = commandMap;
      console.log(`Loaded ${Object.keys(commandMap).length} Ankhbot commands`);
    } catch (error) {
      console.error('Error loading Ankhbot commands:', error);
    }
  }

  /**
   * Watch command files for changes
   */
  watchFiles() {
    // Watch static commands file
    if (fs.existsSync(this.staticCommandsPath)) {
      fs.watchFile(this.staticCommandsPath, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          console.log('Static commands file changed, reloading...');
          this.loadStaticCommands();
        }
      });
    }

    // Watch Ankhbot commands file
    if (fs.existsSync(this.ankhbotCommandsPath)) {
      fs.watchFile(this.ankhbotCommandsPath, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          console.log('Ankhbot commands file changed, reloading...');
          this.loadAnkhbotCommands();
        }
      });
    }
  }

  /**
   * Check if a static command exists
   * @param {string} command 
   * @returns {boolean}
   */
  hasStaticCommand(command) {
    return this.staticCommands.hasOwnProperty(command);
  }

  /**
   * Get a static command response
   * @param {string} command 
   * @returns {string|undefined}
   */
  getStaticCommand(command) {
    return this.staticCommands[command];
  }

  /**
   * Check if an Ankhbot command exists
   * @param {string} command 
   * @returns {boolean}
   */
  hasAnkhbotCommand(command) {
    return this.ankhbotCommands.hasOwnProperty(command);
  }

  /**
   * Get an Ankhbot command response
   * @param {string} command 
   * @returns {string|undefined}
   */
  getAnkhbotCommand(command) {
    return this.ankhbotCommands[command];
  }
}

module.exports = new CommandLoader();