const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

class FunFactCommand {
  constructor() {
    this.funFactsPath = path.join(__dirname, '..', '..', '..', 'conf', 'funfacts');
    this.funFacts = [];
    this.loadFunFacts();
    this.watchFile();
  }

  loadFunFacts() {
    try {
      if (!fs.existsSync(this.funFactsPath)) {
        console.log('Fun facts file not found');
        return;
      }

      const data = fs.readFileSync(this.funFactsPath, 'utf-8');
      this.funFacts = data.split('\n').filter(line => line.trim().length > 0);
      console.log(`Loaded ${this.funFacts.length} fun facts`);
    } catch (error) {
      console.error('Error loading fun facts:', error);
    }
  }

  watchFile() {
    if (fs.existsSync(this.funFactsPath)) {
      fs.watchFile(this.funFactsPath, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          console.log('Fun facts file changed, reloading...');
          this.loadFunFacts();
        }
      });
    }
  }

  async execute(message, args, guildConfig) {
    if (guildConfig.enableFunFacts === false) {
      return;
    }

    if (this.funFacts.length === 0) {
      return message.channel.send('No fun facts found!');
    }

    // Check if a specific fact number was requested
    let factIndex;
    const requestedNum = parseInt(args[0]);
    
    if (!isNaN(requestedNum) && requestedNum > 0 && requestedNum <= this.funFacts.length) {
      factIndex = requestedNum - 1;
    } else {
      factIndex = Math.floor(Math.random() * this.funFacts.length);
    }

    const displayNum = factIndex + 1;
    const funFact = this.funFacts[factIndex];

    const embed = new EmbedBuilder()
      .setTitle(`FunFact #${displayNum}`)
      .setColor(0x21c629)
      .setDescription(funFact);

    await message.channel.send({ embeds: [embed] });
  }
}

const funFactCommand = new FunFactCommand();

module.exports = {
  name: 'funfact',
  description: 'Get a random fun fact',
  
  async execute(message, args, guildConfig) {
    await funFactCommand.execute(message, args, guildConfig);
  }
};