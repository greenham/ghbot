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