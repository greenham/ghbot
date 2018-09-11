/**
 * GHBot4Twitch
 */

// Import modules
const irc = require('irc');
const OBSWebSocket = require('obs-websocket-js');

// Read internal configuration
let config = require('./config.json');
let twitchChat;

const init = (config) => {
  let botChannel = '#' + config.twitch.username.toLowerCase();

  // Connect to OBS Websocket
  const obs = new OBSWebSocket();
  console.log(`Connecting to OBS...`);
  obs.connect({ address: config.obs.websocket.address, password: config.obs.websocket.password })
    .then(() => {
      console.log(`Success! We're connected to OBS!`);
      obs.getSourcesList().then(data => {console.log(data.sources)}).catch(console.error);
      twitchChat = twitchInit(config, obs);
    })
    .catch(err => {
      console.log(err);
    });

  obs.on('error', err => {
    console.error('OBS socket error:', err);
  });

  const twitchInit = (config, obs) => {
    console.log('Connecting to Twitch...');

    // Connect to Twitch IRC server
    let twitchChat = new irc.Client(config.twitch.ircServer, config.twitch.username, {
      password: config.twitch.oauth,
      autoRejoin: true,
      retryCount: 10,
      channels: config.twitch.channels,
      debug: config.debug
    });

    // Set up event listeners for Twitch
    twitchChat.addListener('message', (from, to, message) => {
      // Ignore everything from blacklisted users
      if (config.twitch.blacklistedUsers.includes(from)) return;

      // Listen for commands that start with the designated prefix
      if (message.startsWith(config.twitch.cmdPrefix)) {
        let commandParts = message.slice(config.twitch.cmdPrefix.length).split(' ');
        let commandNoPrefix = commandParts[0] || '';

        // Listen for specific commands from admins
        if (config.twitch.admins.includes(from) || from === config.twitch.username.toLowerCase()) {
          if (commandNoPrefix === 'show') {
            let target = commandParts[1] || false;
            if (!target) {
              twitchChat.say(to, `A scene item name is required!`);
              return;
            }

            obs.getSceneItemProperties({"item": target})
              .then(data => {
                if (data.visible === true) {
                  twitchChat.say(to, "This scene item is already visible. DerpHam");
                } else {
                  obs.setSceneItemProperties({"item": target, "visible": true})
                    .then(res => {
                      twitchChat.say(to, `${target} is now visible.`);
                    })
                    .catch(console.error);
                }
              })
              .catch(err => {
                twitchChat.say(to, JSON.stringify(err));
              });
          } else if (commandNoPrefix === 'hide') {
            let target = commandParts[1] || false;
            if (!target) {
              twitchChat.say(to, `A scene item name is required!`);
              return;
            }
            obs.getSceneItemProperties({"item": target})
              .then(data => {
                if (data.visible === false) {
                  twitchChat.say(to, "This scene item is already hidden. DerpHam");
                } else {
                  obs.setSceneItemProperties({"item": target, "visible": false})
                    .then(res => {
                      twitchChat.say(to, `${target} is now hidden.`);
                    })
                    .catch(console.error);
                }
              })
              .catch(err => {
                twitchChat.say(to, JSON.stringify(err));
              });
          } else if (commandNoPrefix === 'auw') {
            // @TODO: pause songrequest or otherwise fade out its audio
            obs.setSceneItemProperties({"item": "everybody-wow", "visible": true})
              .then(res => {
                twitchChat.say(to, 'Everybody OwenWow');
                // hide the source after a certain amount of time (248s in this case)
                setTimeout(() => {
                  obs.setSceneItemProperties({"item": "everybody-wow", "visible": false})
                    .then(res => {
                      // @TODO: resume songrequest or otherwise fade in its audio
                      twitchChat.say(to, 'OwenWow');
                    }).catch(console.error);
                }, 248000);
              }).catch(console.error);
          } else if (commandNoPrefix === 'switch') {
            let target = commandParts[1] || false;
            if (!target) {
              twitchChat.say(to, `A scene name is required!`);
              return;
            }

            obs.getCurrentScene()
              .then(data => {
                if (data.name === target) {
                  twitchChat.say(to, `That scene is already active! DerpHam`);
                } else {
                  obs.setCurrentScene({"scene-name": target})
                    .then(() => {twitchChat.say(to, `${target} is now active`)})
                    .catch(console.error);
                }
              })
              .catch(console.error);
          } else if (commandNoPrefix === 'reboot') {
            console.log('Received request from admin to reboot...');
            twitchChat.say(to, 'Rebooting...');
            process.exit(0);
          }
        }
      }
    });

    twitchChat.addListener('error', message => {
      if (message.command != 'err_unknowncommand') {
        console.error('error from Twitch IRC Server: ', message);
      }
    });

    twitchChat.addListener('registered', message => {
      console.log(`Connected to ${message.server}`);
    });

    twitchChat.addListener('join', (channel, nick, message) => {
      if (nick === config.twitch.username) {
        console.log(`Joined channel ${channel}`);
      }
    });

    twitchChat.addListener('part', (channel, nick, message) => {
      if (nick === config.twitch.username) {
        console.log(`Left channel ${channel}`);
      }
    });

    twitchChat.addListener('motd', motd => {
      console.log(`Received MOTD: ${motd}`);
    });

    return twitchChat;
  }
}

init(config);

// catches Promise errors
process.on('unhandledRejection', console.error);
