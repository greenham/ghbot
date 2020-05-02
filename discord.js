// Import modules
const Discord = require("discord.js"),
  fs = require("fs"),
  path = require("path"),
  axios = require("axios"),
  staticCommands = require("./lib/static-commands.js"),
  ankhbotCommands = require("./lib/ankhbot-commands.js"),
  config = require("./config.json"),
  { randElement, chunkSubstr } = require("./lib/utils.js");

function init(config) {
  // Set up Discord client
  const client = new Discord.Client();

  // Set up SFX
  const sfxFilePath = path.join(__dirname, "sfx");
  let playing = false;

  // Read in sfx directory, filenames are the commands
  let sfxList = readSfxDirectory(sfxFilePath);
  // Watch directory for changes and update the list
  fs.watch(sfxFilePath, (eventType, filename) => {
    if (eventType === "rename") {
      sfxList = readSfxDirectory(sfxFilePath);
    }
  });

  // @todo DRY this shit up

  // Read in fun facts
  const funFactsFilePath = path.join(__dirname, "conf", "funfacts");
  let funFacts = parseLines(funFactsFilePath);
  fs.watchFile(funFactsFilePath, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      funFacts = parseLines(funFactsFilePath);
    }
  });

  // Read in ham facts
  const hamFactsFilePath = path.join(__dirname, "conf", "hamfacts");
  let hamFacts = parseLines(hamFactsFilePath);
  fs.watchFile(hamFactsFilePath, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      hamFacts = parseLines(hamFactsFilePath);
    }
  });

  // Set up the native commands to handle
  const commands = {
    sfx: (msg, guildConfig) => {
      let allowedSfxChannels = new RegExp(guildConfig.allowedSfxChannels);
      if (!allowedSfxChannels.test(msg.channel.name)) return;
      let sfx = msg.content.split(" ")[1];

      // retrieve sfx list from pastebin
      if (sfx == "" || sfx === undefined) {
        axios
          .get("https://pastebin.com/raw/vRsZxrrw")
          .then((res) => {
            // break the result into half chunks if it exceeds the message limit size
            // (the backticks take up 6 characters, discord limit is 2k)
            let chunks = [res.data];
            if (res.data.length > 1994) {
              chunks = chunkSubstr(res.data, res.data.length / 2);
            }

            chunks.forEach((chunk) => {
              return msg.channel.send("```" + chunk + "```");
            });
          })
          .catch(console.error);

        return true;
      }

      if (playing === true)
        return msg.channel.send("Already playing, please wait.");

      // make sure this file exists either as an mp3 or wav
      let sfxPath;
      if (fs.existsSync(path.join(sfxFilePath, sfx + ".mp3"))) {
        sfxPath = path.join(sfxFilePath, sfx + ".mp3");
      } else if (fs.existsSync(path.join(sfxFilePath, sfx + ".wav"))) {
        sfxPath = path.join(sfxFilePath, sfx + ".wav");
      } else {
        return msg.reply("This sound effect does not exist!");
      }

      if (!msg.guild.voiceConnection)
        return joinVoiceChannel(msg).then(() => commands.sfx(msg, guildConfig));

      playing = true;
      (function play(sfxFile) {
        const dispatcher = msg.guild.voiceConnection.playFile(sfxFile, {
          volume: guildConfig.sfxVolume,
          passes: guildConfig.passes
        });
        dispatcher
          .on("end", (reason) => {
            playing = false;
            msg.guild.voiceConnection.disconnect();
          })
          .on("error", (error) => {
            playing = false;
            msg.guild.voiceConnection.disconnect();
            console.error("Error playing sfx: " + error);
          })
          .on("start", () => {});
      })(sfxPath.toString());
    },
    funfact: (msg) => {
      if (funFacts.length > 0) {
        // return random element from funFacts, unless one is specifically requested
        let el;
        let req = parseInt(msg.content.split(" ")[1]);
        if (Number.isNaN(req) || typeof funFacts[req - 1] === "undefined") {
          el = Math.floor(Math.random() * funFacts.length);
        } else {
          el = req - 1;
        }

        let displayNum = (el + 1).toString();
        let funFact = funFacts[el];
        msg.channel
          .send({
            embed: {
              title: "FunFact #" + displayNum,
              color: 0x21c629,
              description: funFact
            }
          })
          .catch(console.error);
      } else {
        msg.channel.send("No fun facts found!");
      }
    },
    hamfact: (msg) => {
      if (hamFacts.length > 0) {
        // return random element from hamFacts, unless one is specifically requested
        let el;
        let req = parseInt(msg.content.split(" ")[1]);
        if (Number.isNaN(req) || typeof hamFacts[req - 1] === "undefined") {
          el = Math.floor(Math.random() * hamFacts.length);
        } else {
          el = req - 1;
        }

        let displayNum = (el + 1).toString();
        let hamFact = hamFacts[el];
        msg.channel
          .send({
            embed: {
              title: "HamFact #" + displayNum,
              color: 0x21c629,
              description: hamFact
            }
          })
          .catch(console.error);
      } else {
        msg.channel.send("No ham facts found!");
      }
    },
    dance: (msg) => {
      msg.channel.send(
        "*┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛ ┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛ ┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛ ┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛*"
      );
    },
    join: (msg) => {
      if (!msg.guild.voiceConnection) {
        joinVoiceChannel(msg)
          .then(() => {
            //
          })
          .catch(console.error);
      } else {
        return msg.reply(`I'm already in a voice channel!`);
      }
    },
    leave: (msg) => {
      if (msg.guild.voiceConnection) {
        msg.guild.voiceConnection.disconnect();
      } else {
        return msg.reply(
          `If ya don't eat your meat, ya can't have any pudding!`
        );
      }
    },
    listen: (msg) => {
      // listen for a particular member to speak and respond appropriately
      if (msg.guild.voiceConnection) {
        // get the guild member
        //let guildMemberId = "88301001169207296"; // me
        let guildMemberId = "153563292265086977"; // Screevo
        let guildMember = msg.guild.members.get(guildMemberId);
        if (guildMember) {
          let listenInterval = 1000;
          setInterval(() => {
            if (guildMember.speaking === true) {
              msg.content = "!sfx stfu";
              commands.sfx(msg, false);
            }
          }, listenInterval);
        } else {
          console.error(
            `Could not find specified guild member: ${guildMemberId}!`
          );
          msg.guild.voiceConnection.disconnect();
        }
      } else {
        // join the voice channel then call this command again
        joinVoiceChannel(msg)
          .then(() => {
            commands.listen(msg);
          })
          .catch(console.error);
      }
    },
    reboot: (msg) => {
      if (msg.author.id == config.adminID) process.exit(); //Requires a node module like Forever to work.
    }
  };

  client
    // Wait for discord to be ready, handle messages
    .on("ready", () => {
      console.log(`${config.botName} is connected and ready`);
      client.setRandomActivity();
    })
    // Listen for commands for the bot to respond to across all channels
    .on("message", (msg) => {
      // Ignore messages from unconfigured guilds
      if (msg.guild) {
        if (!config.discord.guilds[msg.guild.id]) {
          return;
        }
      }

      // Find the guild config for this msg, use default if no guild (DM)
      let guildConfig = config.discord.guilds[msg.guild.id];

      // Parse message content
      msg.originalContent = msg.content;
      msg.content = msg.content.toLowerCase();

      // Make sure the command starts with the configured prefix
      if (!msg.content.startsWith(guildConfig.prefix)) return;

      let commandNoPrefix = msg.content
        .slice(guildConfig.prefix.length)
        .split(" ")[0];

      // check for native command first
      if (commands.hasOwnProperty(commandNoPrefix)) {
        console.log(
          `'${commandNoPrefix}' received in ${guildConfig.internalName}#${msg.channel.name} from @${msg.author.username}`
        );
        commands[commandNoPrefix](msg, guildConfig);
        // then a static command we've manually added
      } else if (staticCommands.exists(commandNoPrefix)) {
        let result = staticCommands.get(commandNoPrefix);
        console.log(
          `'${commandNoPrefix}' received in ${guildConfig.internalName}#${msg.channel.name} from @${msg.author.username}`
        );
        msg.channel
          .send({
            embed: {
              title: commandNoPrefix,
              color: 0x21c629,
              description: result
            }
          })
          .catch(console.error);
        // then a command exported from ankhbot
      } else if (ankhbotCommands.exists(commandNoPrefix)) {
        let result = ankhbotCommands.get(commandNoPrefix);
        msg.channel
          .send({
            embed: {
              title: commandNoPrefix,
              color: 0x21c629,
              description: result
            }
          })
          .catch(console.error);
      } else {
        // Not a command we recognize, ignore
      }
    })
    // Handle new members joining one of our guilds
    .on("guildMemberAdd", (member) => {
      // Ignore events from unconfigured guilds
      if (member.guild) {
        if (!config.discord.guilds[member.guild.id]) {
          return;
        }
      } else if (config.discord.handleDMs === false) {
        return;
      }

      console.log(
        `A new member has joined '${member.guild.name}': ${member.displayName}`
      );
    })
    // Log guild becoming unavailable (usually due to server outage)
    .on("guildUnavailable", (guild) => {
      console.log(
        `Guild '${guild.name}' is no longer available! Most likely due to server outage.`
      );
    })
    // Log debug messages if enabled
    .on("debug", (info) => {
      if (config.debug === true) {
        console.log(`[${new Date()}] DEBUG: ${info}`);
      }
    })
    // Log disconnect event
    .on("disconnect", (event) => {
      console.log(
        `Web Socket disconnected with code ${event.code} and reason '${event.reason}'`
      );
    })
    // Log errors
    .on("error", console.error)
    // Log the bot in
    .login(config.discord.token);
}

function readSfxDirectory(path) {
  let thePath = path || sfxFilePath;
  let sfxList = fs.readdirSync(thePath);
  sfxList.forEach(function (el, index, a) {
    a[index] = el.split(".")[0];
  });
  return sfxList;
}

function joinVoiceChannel(msg) {
  return new Promise((resolve, reject) => {
    const voiceChannel = msg.member.voiceChannel;
    if (!voiceChannel || voiceChannel.type !== "voice")
      return msg.reply("I couldn't connect to your voice channel...");
    voiceChannel
      .join()
      .then((connection) => resolve(connection))
      .catch((err) => reject(err));
  });
}

// Read/parse text lines from a file
function parseLines(filePath) {
  let lines = [];
  let data = fs.readFileSync(filePath, "utf-8");
  let splitLines = data.toString().split("\n");
  splitLines.forEach(function (line) {
    if (line.length > 0) {
      lines.push(line);
    }
  });
  return lines;
}

// catch Promise errors
process.on("unhandledRejection", console.error);

// Fire it up
init(config);

Discord.Client.prototype.setRandomActivity = function () {
  if (!config.discord.master) return;
  let activity = randElement(config.discord.activities);
  console.log(`Setting Discord activity to: ${activity}`);
  this.user.setActivity(activity, {
    url: `https://twitch.tv/fgfm`,
    type: "STREAMING"
  });
};
