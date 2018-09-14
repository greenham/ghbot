/**
 * GHBot4Twitch
 */

// @TODO: modularize OBS and Twitch code
// @TODO: Make the bot aware of what video is current active
// @TODO: Change video playlist source on an interval
// @TODO: Rotating background images (leftside)


// Import modules
const irc = require('irc');
const OBSWebSocket = require('obs-websocket-js');
const schedule = require('node-schedule');
const util = require('./lib/util');

// Read internal configuration
let config = require('./config.json');
let currentPlaylist = config.obs.defaultPlaylist;
let twitchChannel = config.twitch.channels[0].toLowerCase();

// Connect to OBS Websocket
const obs = new OBSWebSocket();
console.log(`Connecting to OBS...`);
obs.connect({ address: config.obs.websocket.address, password: config.obs.websocket.password })
  .then(() => {
    console.log(`Success! We're connected to OBS!`);
    return twitchInit(config, obs);
  })
  .then(data => {
    return streamInit(config, obs, data);
  })
  .catch(err => {
    console.log(err);
  });

obs.on('error', err => {
  console.error('OBS socket error:', err);
});

const twitchInit = (config, obs) => {
  return new Promise((resolve, reject) => {
    console.log('Connecting to Twitch...');

    // Connect to Twitch IRC server with the Bot
    let twitchChat = new irc.Client(config.twitch.ircServer, config.twitch.username, {
      password: config.twitch.oauth,
      autoRejoin: true,
      retryCount: 10,
      channels: config.twitch.channels,
      debug: config.debug
    });

    // Also connect with an editor account
    let editorChat = new irc.Client(config.twitch.ircServer, config.twitch.editorLogin.username, {
      password: config.twitch.editorLogin.oauth,
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

          if (commandNoPrefix === 'show' || commandNoPrefix === 'hide') {

            let newVisibility = (commandNoPrefix === 'show');
            let visibleTerm = (newVisibility ? 'visible' : 'hidden');

            let target = commandParts[1] || false;
            if (!target) {
              twitchChat.say(to, `A scene item name is required!`);
              return;
            }

            let sceneItem = {"item": target};

            let sceneOrGroup = commandParts[2] || false;
            if (sceneOrGroup !== false) {
              sceneItem["scene-name"] = sceneOrGroup;
            }

            obs.getSceneItemProperties(sceneItem)
              .then(data => {
                if (data.visible === newVisibility) {
                  twitchChat.say(to, `This scene item is already ${visibleTerm}. DerpHam`);
                } else {
                  sceneItem.visible = newVisibility;
                  obs.setSceneItemProperties(sceneItem)
                    .then(res => {
                      twitchChat.say(to, `${target} is now ${visibleTerm}.`);
                    })
                    .catch(console.error);
                }
              })
              .catch(err => {
                twitchChat.say(to, JSON.stringify(err));
              });

          } else if (commandNoPrefix === 't') {
            let target = commandParts[1] || false;
            if (!target) {
              twitchChat.say(to, `A scene item name is required!`);
              return;
            }

            let sceneItem = {"item": target};

            obs.getSceneItemProperties(sceneItem)
              .then(data => {
                let newVisibility = !data.visible;
                let visibleTerm = (newVisibility ? 'visible' : 'hidden');

                sceneItem.visible = newVisibility;
                obs.setSceneItemProperties(sceneItem)
                  .then(res => {
                    twitchChat.say(to, `${target} is now ${visibleTerm}.`);
                  })
                  .catch(console.error);
              })
              .catch(err => {
                twitchChat.say(to, JSON.stringify(err));
              });
          } else if (commandNoPrefix === 'swap') {
            // hide first argument, show second argument
            let targetToHide = commandParts[1] || false;
            let targetToShow = commandParts[2] || false;
            if (targetToHide === false || targetToShow == false) {
              twitchChat.say(to, `Format: ${config.twitch.cmdPrefix}swap <item-to-hide> <item-to-show>`);
              return
            }

            obs.setSceneItemProperties({"item": targetToHide, "visible": false})
              .then(res => {
                obs.setSceneItemProperties({"item": targetToShow, "visible": true});
              })
              .catch(console.error);
          } else if (commandNoPrefix === 'auw') {
            // @TODO: switch to 'commercial' scene and show appropriate items, then switch back
            // this way, playing a commercial doesn't have to know what's playing in the other scene
            obs.setCurrentScene({"scene-name": "commercial"})
              .then(res => {
                // show the video
                return obs.setSceneItemProperties({"item": "everybody-wow", "scene-name": "commercial", "visible": true});
              })
              .then(res => {
                // mute songrequest audio
                editorChat.say(to, '!volume 0');
                // show owen
                obs.setSceneItemProperties({"item": "owen", "scene-name": "commercial", "visible": true});              
                // tell chat what's up
                twitchChat.say(to, 'Everybody OwenWow');
                // swap back to fgfm scene after the video ends
                setTimeout(() => {
                  // hide video
                  obs.setSceneItemProperties({"item": "everybody-wow", "scene-name": "commercial", "visible": false})
                  // hide owen
                  obs.setSceneItemProperties({"item": "owen", "scene-name": "commercial", "visible": false});
                  // unmute songrequest audio
                  editorChat.say(to, '!volume 75');
                  // swap back to fgfm
                  obs.setCurrentScene({"scene-name": "fgfm"});
                }, 248000);
              })
              .catch(console.error);

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
    editorChat.addListener('error', message => {
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

    resolve({"botChat": twitchChat, "editorChat": editorChat});
  });
}

const streamInit = (config, obs, twitch) => {
  return new Promise((resolve, reject) => {
    console.log(`Initializing stream timers...`);
  
    // When: Every 4 hours at 55 past
    // What: AUW
    let auwJob = schedule.scheduleJob("55 */4 * * *", () => {
      // AUW
      twitch.editorChat.say(twitchChannel, `${config.twitch.cmdPrefix}auw`);
    });
    console.log(`AUW is scheduled to be shown at ${auwJob.nextInvocation()}`);

    let userVotes = [];
    let playlistChoices = config.obs.availablePlaylists.map((e, i, a) => {
      return `[${i+1}] ${e.chatName}`;
    });
    const sayVote = () => {twitch.botChat.say(twitchChannel, `Vote for which video playlist you'd like to see next using ${config.twitch.cmdPrefix}vote #: ${playlistChoices.join(' | ')}`)};
    setTimeout(sayVote, 5000);
    setInterval(sayVote, 900000);

    // When: Every 2 Hours
    // What: Change the video playlist
    let changePlaylistJob = schedule.scheduleJob("* */2 * * *", () => {
      // Base the selection on user votes collected since the last invocation (unless there are 0 votes, then choose randomly)
      let newPlaylist;
      if (userVotes.length === 0) {
        // choose a random item other than currentPlaylist from config.obs.availablePlaylists
        let choices = config.obs.availablePlaylists.slice(0);
        currentChoice = choices.indexOf(e => e.sceneItem === currentPlaylist);
        choices.splice(currentChoice, 1);
        newPlaylist = util.randElement(choices);
        console.log(`PLAYLIST CHOSEN RANDOMLY: ${newPlaylist.chatName}`);
        twitch.botChat.say(twitchChannel, `No Votes Logged -- Next Playlist Chosen at Random: ${newPlaylist.chatName}`);
      } else {
        // tally and sort votes
        let voteTallies = [];
        util.asyncForEach(userVotes, vote => {
          tallyIndex = voteTallies.findIndex(e => e.id === vote.vote);
          if (tallyIndex !== -1) {
            voteTallies[tallyIndex].count++;
          } else {
            voteTallies.push({id: vote.vote, count: 1});
          }
        });
        voteTallies.sort((a, b) => {
          if (a.count < b.count) {
            return -1;
          }
          if (a.count > b.count) {
            return 1;
          }
          // a must be equal to b
          return 0;
        });

        console.log(`Voting Results: ${JSON.stringify(voteTallies)}`);
        newPlaylist = config.obs.availablePlaylists[voteTallies[0].id-1];
        console.log(`WINNER OF THE VOTE: ${newPlaylist.chatName}`);
        twitch.botChat.say(twitchChannel, `Winner of the Playlist Vote: ${newPlaylist.chatName}`);

        // clear user votes
        userVotes = [];
      }

      // only do this if the playlists are actually different
      if (currentPlaylist === newPlaylist.sceneItem) {
        twitch.botChat.say(twitchChannel, `We gucci. Stay comfy, nerds. DataComfy`);
      } else {
        console.log(`Changing playlist from ${currentPlaylist} to ${newPlaylist.sceneItem}`);
        // @TODO: Don't use twitch chat for this
        twitch.editorChat.say(twitchChannel, `${config.twitch.cmdPrefix}swap ${currentPlaylist} ${newPlaylist.sceneItem}`);
        twitch.editorChat.say(twitchChannel, `!setcurrent NOW SHOWING: ${newPlaylist.activity}`);
        // if we're showing TTAS segments, hide the label, if it's anything else, show
        if (newPlaylist.sceneItem === 'ttas-segments') {
          twitch.editorChat.say(twitchChannel, `${config.twitch.cmdPrefix}hide current-activity`);
        } else {
          twitch.editorChat.say(twitchChannel, `${config.twitch.cmdPrefix}show current-activity`);
        }
        currentPlaylist = newPlaylist.sceneItem;
      }
    });
    console.log(`Playlist will be changed at ${changePlaylistJob.nextInvocation()}`);

    // Track user votes for playlist
    twitch.botChat.addListener('message', (from, to, message) => {
       // Ignore everything from blacklisted users
      if (config.twitch.blacklistedUsers.includes(from)) return;

      // Listen for commands that start with the designated prefix
      if (message.startsWith(config.twitch.cmdPrefix)) {
        let commandParts = message.slice(config.twitch.cmdPrefix.length).split(' ');
        let commandNoPrefix = commandParts[0] || '';
        if (commandNoPrefix === 'vote') {
          let userVote = commandParts[1] || false;

          if (userVote === false) {
            return sayVote();
          }

          userVote = Number.parseInt(userVote);

          if (!Number.isInteger(userVote) || userVote < 1 || userVote > playlistChoices.length) {
            return twitch.botChat.say(to, `@${from}, please choose an option from 1 - ${playlistChoices.length}!`);
          }

          // Check for uniqueness of vote
          // if it's not unique, update the vote
          let prevVote = userVotes.findIndex(e => e.from === from);
          if (prevVote !== -1) {
            if (userVotes[prevVote].vote !== userVote) {
              // update vote and inform the user
              userVotes[prevVote].vote = userVote;
              twitch.botChat.say(to, `@${from}, your vote has been updated!`);
            }
          } else {
            // log user vote
            userVotes.push({"from": from, "vote": userVote});
            twitch.botChat.say(to, `@${from}, your vote has been logged!`);
          }
        }
      }
    });
  });
}

// catches Promise errors
process.on('unhandledRejection', console.error);
