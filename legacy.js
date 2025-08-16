// Import modules
const Discord = require("discord.js"),
  fs = require("fs"),
  path = require("path"),
  axios = require("axios"),
  schedule = require("node-schedule"),
  staticCommands = require("./lib/static-commands.js"),
  ankhbotCommands = require("./lib/ankhbot-commands.js"),
  { randElement, chunkSubstr } = require("./lib/utils.js"),
  config = require("./config.json");

function init(config) {
  // Set up Discord client
  const client = new Discord.Client();

  // Set up SFX
  const sfxFilePath = path.join(__dirname, "sfx");

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
    sfx: async (msg, guildConfig) => {
      let allowedSfxChannels = new RegExp(guildConfig.allowedSfxChannels);
      if (!allowedSfxChannels.test(msg.channel.name)) return;
      let sfx = msg.content.split(" ")[1];

      // retrieve sfx list from pastebin
      if (sfx == "" || sfx === undefined) {
        axios
          .get("https://rentry.co/ghbotsfx/raw")
          .then((res) => {
            // break the result into half chunks if it exceeds the message limit size
            // (discord limit is 2k)
            let chunks = [res.data];
            if (res.data.length > 2000) {
              chunks = chunkSubstr(res.data, res.data.length / 2);
            }

            chunks.forEach((chunk) => {
              return msg.channel.send(chunk);
            });
          })
          .catch(console.error);

        return true;
      }

      // make sure this file exists either as an mp3 or wav
      let sfxPath;
      if (fs.existsSync(path.join(sfxFilePath, sfx + ".mp3"))) {
        sfxPath = path.join(sfxFilePath, sfx + ".mp3");
      } else if (fs.existsSync(path.join(sfxFilePath, sfx + ".wav"))) {
        sfxPath = path.join(sfxFilePath, sfx + ".wav");
      } else {
        return msg.reply("This sound effect does not exist!");
      }

      // Join the same voice channel of the author of the message
      const connection = await joinVoiceChannel(msg);
      if (connection === false) {
        return msg.reply("I couldn't connect to your voice channel...");
      }

      (function play(sfxFile) {
        const dispatcher = connection.play(sfxFile, {
          volume: guildConfig.sfxVolume,
          passes: guildConfig.passes,
        });
        dispatcher
          .on("finish", (reason) => {
            connection.disconnect();
          })
          .on("error", (error) => {
            connection.disconnect();
            console.error("Error playing sfx: " + error);
          })
          .on("start", () => {});
      })(sfxPath.toString());
    },
    funfact: (msg, guildConfig) => {
      if (guildConfig.enableFunFacts === false) {
        return;
      }

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
              description: funFact,
            },
          })
          .catch(console.error);
      } else {
        msg.channel.send("No fun facts found!");
      }
    },
    hamfact: (msg, guildConfig) => {
      if (guildConfig.enableHamFacts === false) {
        return;
      }

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
              description: hamFact,
            },
          })
          .catch(console.error);
      } else {
        msg.channel.send("No ham facts found!");
      }
    },
    dance: (msg, guildConfig) => {
      msg.channel.send(
        "*┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛ ┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛ ┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛ ┏(-_-)┓┏(-_-)┛┗(-_- )┓┗(-_-)┛┏(-_-)┛*"
      );
    },
    // Allow members to request role additions/removals for allowed roles
    role: (msg, guildConfig) => {
      // make sure there are allowed roles defined
      if (
        typeof guildConfig.allowedRolesForRequest === undefined ||
        guildConfig.allowedRolesForRequest.length === 0
      ) {
        return msg.reply(
          "No roles are currently allowed to be added/removed by members."
        );
      }

      let validRoles = guildConfig.allowedRolesForRequest.split("|");

      if (msg.content === guildConfig.prefix + "role") {
        return msg.reply(
          `Useage: ${guildConfig.prefix}role {add|remove} {${guildConfig.allowedRolesForRequest}}`
        );
      }

      // parse+validate action+role (use original case from message because roles are case-sensitive)
      let roleName = msg.originalContent.match(
        /role\s(add|remove)\s([a-z0-9\-]+)/i
      );
      if (!roleName) {
        return msg.reply(
          `Useage: ${guildConfig.prefix}role {add|remove} {${guildConfig.allowedRolesForRequest}}`
        );
      } else {
        let tester = new RegExp(guildConfig.allowedRolesForRequest, "i");
        if (tester.test(roleName[2])) {
          // make sure this message is in a guild channel they're a member of
          if (!msg.guild) return;

          // find the role in the member's guild
          let role = msg.guild.roles.cache.find((x) => x.name === roleName[2]);

          if (!role) {
            return msg.reply(`${roleName[2]} is not a role on this server!`);
          }

          // add/remove the role and react to the message with the results
          if (roleName[1] === "add") {
            msg.member.roles
              .add(role, "User requested")
              .then((requestingMember) => {
                msg
                  .react("👍")
                  .then(() => {
                    console.log("Reaction sent");
                  })
                  .catch(console.error);
              })
              .catch((err) => {
                console.error(`Error during role addition: ${err}`);
                msg
                  .react("⚠")
                  .then(() => {
                    console.log("Reaction sent");
                  })
                  .catch(console.error);
              });
          } else if (roleName[1] === "remove") {
            msg.member.roles
              .remove(role, "User requested")
              .then((requestingMember) => {
                msg
                  .react("👍")
                  .then(() => {
                    console.log("Reaction sent");
                  })
                  .catch(console.error);
              })
              .catch((err) => {
                console.error(`Error during role addition: ${err}`);
                msg
                  .react("⚠")
                  .then(() => {
                    console.log("Reaction sent");
                  })
                  .catch(console.error);
              });
          } else {
            msg.reply(
              `You must use add/remove after the role command! *e.g. ${guildConfig.prefix}role add ${validRoles[0]}*`
            );
          }
        } else {
          msg.reply(
            `**${
              roleName[2]
            }** is not a valid role name! The roles allowed for request are: ${validRoles.join(
              ","
            )}`
          );
        }
      }
    },
    join: (msg, guildConfig) => {
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
    leave: (msg, guildConfig) => {
      if (msg.guild.voiceConnection) {
        msg.guild.voiceConnection.disconnect();
      } else {
        return msg.reply(
          `If ya don't eat your meat, ya can't have any pudding!`
        );
      }
    },
    listen: (msg, guildConfig) => {
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
            commands.listen(msg, guildConfig);
          })
          .catch(console.error);
      }
    },
    reboot: (msg, guildConfig) => {
      if (msg.author.id == config.discord.adminUserId) process.exit(); // Requires a node module like Forever to work.
    },
  };

  client
    // Wait for discord to be ready, handle messages
    .on("ready", () => {
      console.log(`${config.botName} is connected and ready`);
      client.setRandomActivity();
      setInterval(() => {
        client.setRandomActivity();
      }, 3600 * 1000);

      // Set up scheduled events for each guild
      config.discord.guilds.forEach(async (guild) => {
        let discordGuild = false;
        try {
          discordGuild = await client.guilds.fetch(guild.id);
        } catch (err) {
          console.error(err);
        }

        if (!discordGuild) return;

        if (
          guild.hasOwnProperty("scheduledEvents") &&
          guild.scheduledEvents.length > 0
        ) {
          guild.scheduledEvents.forEach(async (event) => {
            let channel = false;
            if (
              event.hasOwnProperty("channelId") &&
              event.channelId.length > 0
            ) {
              channel = await discordGuild.channels.resolve(event.channelId);
            }

            if (!channel) {
              console.log(
                `Invalid channel configured for event ${event.id}, guild ${guild.name}`
              );
              return;
            }

            let pingRole = false;
            if (
              event.hasOwnProperty("pingRoleId") &&
              event.pingRoleId.length > 0
            ) {
              pingRole = await discordGuild.roles.fetch(event.pingRoleId);
            }

            console.log(
              `Scheduling event ${event.id} for ${discordGuild.name}...`
            );
            const job = schedule.scheduleJob(event.schedule, () => {
              let payload = [];
              if (pingRole !== false) {
                payload.push(pingRole);
              }
              if (event.hasOwnProperty("message") && event.message.length > 0) {
                payload.push(event.message);
              }
              channel.send(payload);
            });
            console.log(`Next invocation: ${job.nextInvocation()}`);
          });
        }
      });
    })
    // Listen for commands for the bot to respond to across all channels
    .on("message", (msg) => {
      // Ignore DMs and messages from unconfigured guilds
      if (msg.guild) {
        if (!config.discord.guilds.find((g) => g.id === msg.guild.id)) {
          return;
        }
      } else {
        return;
      }

      // Ignore anything from blacklisted users
      if (config.discord.blacklistedUsers.includes(msg.author.id)) {
        return;
      }

      // Find the guild config for this msg, use default if no guild (DM)
      let guildConfig = config.discord.guilds.find(
        (g) => g.id === msg.guild.id
      );

      // Parse message content
      msg.originalContent = msg.content;
      msg.content = msg.content.toLowerCase();

      // Make sure the command starts with the configured prefix
      if (!msg.content.startsWith(guildConfig.prefix)) return;

      let commandNoPrefix = msg.content
        .slice(guildConfig.prefix.length)
        .split(" ")[0];

      console.log(
        `'${commandNoPrefix}' received in ${guildConfig.internalName}#${msg.channel.name} from @${msg.author.username}`
      );

      // check for native command first
      if (commands.hasOwnProperty(commandNoPrefix)) {
        commands[commandNoPrefix](msg, guildConfig);
        // then a static command we've manually added
      } else if (staticCommands.exists(commandNoPrefix)) {
        let result = staticCommands.get(commandNoPrefix);
        msg.channel
          .send({
            embed: {
              title: commandNoPrefix,
              color: 0x21c629,
              description: result,
            },
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
              description: result,
            },
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
        if (!config.discord.guilds.find((g) => g.id === msg.guild.id)) {
          return;
        }
      } else {
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

async function joinVoiceChannel(message) {
  // Join the same voice channel of the author of the message
  if (message.member.voice.channel) {
    return await message.member.voice.channel.join();
  } else {
    return false;
  }
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
  let activity =
    config.discord.activities.length > 0
      ? randElement(config.discord.activities)
      : "DESTROY ALL HUMANS";

  console.log(`Setting Discord activity to: ${activity}`);

  this.user.setActivity(activity, {
    url: `https://twitch.tv/fgfm`,
    type: "STREAMING",
  });
};
