// Import modules
const { Client } = require('discord.js'),
  fs = require('fs'),
  path = require('path'),
  moment = require('moment'),
  timers = require('./lib/timers.js'),
  config = require('./config.json');

// Set up Discord client
const client = new Client();

// Set up SFX
const sfxFilePath = path.join(__dirname, 'sfx');
const allowedSfxChannels = new RegExp(config.allowedSfxChannels);
let playOptions = {volume: config.sfxVolume, passes: config.passes};
let playing = false;

// Read in sfx directory, filenames are the commands
let sfxList = readSfxDirectory(sfxFilePath);
// Watch directory for changes and update the list
fs.watch(sfxFilePath, (eventType, filename) => {
  if (eventType === 'rename') {
    sfxList = readSfxDirectory(sfxFilePath);
  }
});

// @todo DRY this shit up

// Read in fun facts
const funFactsFilePath = path.join(__dirname, 'conf', 'funfacts');
let funFacts = parseLines(funFactsFilePath);
fs.watchFile(funFactsFilePath, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    funFacts = parseLines(funFactsFilePath);
  }
});

// Read in ham facts
const hamFactsFilePath = path.join(__dirname, 'conf', 'hamfacts');
let hamFacts = parseLines(hamFactsFilePath);
fs.watchFile(hamFactsFilePath, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    hamFacts = parseLines(hamFactsFilePath);
  }
});

// Set up the native commands to handle
const commands = {
  'sfx': (msg) => {
    if (!allowedSfxChannels.test(msg.channel.name)) return;
    let sfx = msg.content.split(' ')[1];
    if (sfx == '' || sfx === undefined) return msg.channel.send('```'+sfxList.join(', ')+'```');

    if (playing === true) return msg.channel.send('Already playing, please wait.');

    // make sure this file exists either as an mp3 or wav
    let sfxPath;
    if (fs.existsSync(path.join(sfxFilePath, sfx + '.mp3'))) {
      sfxPath = path.join(sfxFilePath, sfx + '.mp3');
    } else if (fs.existsSync(path.join(sfxFilePath, sfx + '.wav'))) {
      sfxPath = path.join(sfxFilePath, sfx + '.wav');
    } else {
      return msg.reply('This sound effect does not exist!');
    }

    if (!msg.guild.voiceConnection) return joinVoiceChannel(msg).then(() => commands.sfx(msg));

    playing = true;
    (function play(sfxFile) {
      const dispatcher = msg.guild.voiceConnection.playFile(sfxFile, playOptions);
      dispatcher.on('end', reason => {
        playing = false;
        msg.guild.voiceConnection.disconnect();
      })
      .on('error', error => {
        playing = false;
        msg.guild.voiceConnection.disconnect();
      })
      .on('start', () => {});
    })(sfxPath);
  },
  'funfact': (msg) => {
    if (funFacts.length > 0) {
      // return random element from funFacts, unless one is specifically requested
      let el;
      let req = parseInt(msg.content.split(' ')[1]);
      if (Number.isNaN(req) || typeof funFacts[req-1] === 'undefined') {
        el = Math.floor(Math.random() * funFacts.length);
      } else {
        el = req - 1;
      }

      let displayNum = (el+1).toString();
      let funFact = funFacts[el]
      msg.channel.send({embed: {
        "title": "FunFact #"+displayNum,
        "color": 0xf30bff,
        "description": funFact
      }}).catch(console.error);
    } else {
      msg.channel.send("No fun facts found!");
    }
  },
  'hamfact': (msg) => {
    if (hamFacts.length > 0) {
      // return random element from hamFacts, unless one is specifically requested
      let el;
      let req = parseInt(msg.content.split(' ')[1]);
      if (Number.isNaN(req) || typeof hamFacts[req-1] === 'undefined') {
        el = Math.floor(Math.random() * hamFacts.length);
      } else {
        el = req - 1;
      }

      let displayNum = (el+1).toString();
      let hamFact = hamFacts[el]
      msg.channel.send({embed: {
        "title": "hamFact #"+displayNum,
        "color": 0xf30bff,
        "description": hamFact
      }}).catch(console.error);
    } else {
      msg.channel.send("No ham facts found!");
    }
  },
  'reboot': (msg) => {
    if (msg.author.id == config.adminID) process.exit(); //Requires a node module like Forever to work.
  }
};

// Wait for discord to be ready, handle messages
client.on('ready', () => {
  console.log(`${config.botName} is connected and ready`);

  let botChannel = client.channels.find('name', config.botChannel);

  // Test timer
  /*let timeToBlazeIt = moment().hour(16).minute(20).second(0).valueOf();
  timers.onceAndRepeat(timeToBlazeIt, 86400, 'blazeit')
    .on('blazeit', () => {
      let emoji = client.guilds.first().emojis.find('name', 'BlazedHam');
      alertsChannel.send(`You know what time it is. ${emoji}`);
    });*/
}).on('message', msg => {
  if (!msg.content.startsWith(config.prefix)) return;
  let cmd = msg.content.toLowerCase().slice(config.prefix.length).split(' ')[0];
  if (commands.hasOwnProperty(cmd)) commands[cmd](msg);
});
client.login(config.d_token);

function readSfxDirectory(path)
{
  let sfxList = fs.readdirSync(sfxFilePath);
  sfxList.forEach(function(el, index, a) {
    a[index] = el.split('.')[0];
  });
  return sfxList;
}

function joinVoiceChannel(msg)
{
  return new Promise((resolve, reject) => {
    const voiceChannel = msg.member.voiceChannel;
    if (!voiceChannel || voiceChannel.type !== 'voice') return msg.reply('I couldn\'t connect to your voice channel...');
    voiceChannel.join().then(connection => resolve(connection)).catch(err => reject(err));
  });
}

// Read/parse text lines from a file
function parseLines(filePath)
{
  let lines = [];
  let data = fs.readFileSync(filePath, 'utf-8');
  let splitLines = data.toString().split('\n');
  splitLines.forEach(function(line) {
    if (line.length > 0) {
      lines.push(line);
    }
  });
  return lines;
}