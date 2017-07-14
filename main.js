const { Client } = require('discord.js');
const fs = require('fs');
const path = require('path');
const tokens = require('./tokens.json');

const client = new Client();
const sfxFilePath = path.join(__dirname, 'sfx');

let playOptions = {volume: 0.25, passes: tokens.passes};
let playing = false;

// read in sfx directory, filenames are the commands
let sfxList = fs.readdirSync(sfxFilePath);
sfxList.forEach(function(el, index, a) {
  a[index] = el.split('.')[0];
});

const commands = {
  'x': (msg) => {
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
      return msg.channel.send('This sound effect does not exist!');
    }

    if (!msg.guild.voiceConnection) return commands.xjoin(msg).then(() => commands.x(msg));

    playing = true;
    (function play(song) {
      console.log(song);
      const dispatcher = msg.guild.voiceConnection.playFile(song, playOptions);
      dispatcher.on('end', reason => {
            console.log('end: ' + reason)
            playing = false;
            msg.guild.voiceConnection.disconnect();
          })
          .on('error', error => {
            console.log('error: ' + error);
            playing = false;
            msg.guild.voiceConnection.disconnect();
          })
          .on('start', () => {console.log('started');});
    })(sfxPath);
  },
  'xjoin': (msg) => {
    return new Promise((resolve, reject) => {
      const voiceChannel = msg.member.voiceChannel;
      if (!voiceChannel || voiceChannel.type !== 'voice') return msg.reply('I couldn\'t connect to your voice channel...');
      voiceChannel.join().then(connection => resolve(connection)).catch(err => reject(err));
    });
  },
  'xhelp': (msg) => {
    let tosend = ['```xl', tokens.prefix + 'x {sfx}: "Plays the requested sound effect in your current voice channel"', '```'];
    msg.channel.sendMessage(tosend.join('\n'));
  },
  'xreboot': (msg) => {
    if (msg.author.id == tokens.adminID) process.exit(); //Requires a node module like Forever to work.
  }
};

client.on('ready', () => {
  console.log('ready!');
});

client.on('message', msg => {
  if (!msg.content.startsWith(tokens.prefix)) return;
  let cmd = msg.content.toLowerCase().slice(tokens.prefix.length).split(' ')[0];
  if (commands.hasOwnProperty(cmd)) commands[cmd](msg);
});
client.login(tokens.d_token);