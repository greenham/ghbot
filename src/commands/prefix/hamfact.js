const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

class HamFactCommand {
  constructor() {
    this.hamFactsPath = path.join(__dirname, '..', '..', '..', 'conf', 'hamfacts');
    this.hamFacts = [];
    this.loadHamFacts();
    this.watchFile();
  }

  loadHamFacts() {
    try {
      if (!fs.existsSync(this.hamFactsPath)) {
        console.log('Ham facts file not found');
        return;
      }

      const data = fs.readFileSync(this.hamFactsPath, 'utf-8');
      this.hamFacts = data.split('\n').filter(line => line.trim().length > 0);
      console.log(`Loaded ${this.hamFacts.length} ham facts`);
    } catch (error) {
      console.error('Error loading ham facts:', error);
    }
  }

  watchFile() {
    if (fs.existsSync(this.hamFactsPath)) {
      fs.watchFile(this.hamFactsPath, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          console.log('Ham facts file changed, reloading...');
          this.loadHamFacts();
        }
      });
    }
  }

  async execute(message, args, guildConfig) {
    if (guildConfig.enableHamFacts === false) {
      return;
    }

    if (this.hamFacts.length === 0) {
      return message.channel.send('No ham facts found!');
    }

    // Check if a specific fact number was requested
    let factIndex;
    const requestedNum = parseInt(args[0]);
    
    if (!isNaN(requestedNum) && requestedNum > 0 && requestedNum <= this.hamFacts.length) {
      factIndex = requestedNum - 1;
    } else {
      factIndex = Math.floor(Math.random() * this.hamFacts.length);
    }

    const displayNum = factIndex + 1;
    const hamFact = this.hamFacts[factIndex];

    const embed = new EmbedBuilder()
      .setTitle(`HamFact #${displayNum}`)
      .setColor(0x21c629)
      .setDescription(hamFact);

    await message.channel.send({ embeds: [embed] });
  }
}

const hamFactCommand = new HamFactCommand();

module.exports = {
  name: 'hamfact',
  description: 'Get a random ham fact',
  
  async execute(message, args, guildConfig) {
    await hamFactCommand.execute(message, args, guildConfig);
  }
};