/**
 * GHBot4Twitch
 */

// @TODO: modularize OBS and Twitch code
// @TODO: Make the bot aware of what video is current active
// @TODO: Change video playlist source on an interval
// @TODO: Rotating background images (leftside)
// @TODO: Stream alerts for chat
// @TODO: Instead of playlists being chosen, have a database of files that can be played
// dynamically load this into a single media source that hides itself after playback ends
// listen for the event of the video ending and switch the source to the next one in the queue
// 
// We can have the video queue work a lot like the songrequest queue.
// Instead of a new playlist being chosen every 2 hours, votes will be held for which *individual* video should be added to the queue next.
// A list of 10 or so will be chosen at random to be voted on. The top (x) will be added to the video queue. If nothing gets voted on, something random gets added.
// This will actually be easier on OBS too -- instead of having multiple playlists I have to manage within there, I can use a single media source and dynamically load whatever video gets chosen into that.
// I can also store whatever metadata about the video I want so I can update the labels automatically too. OpieOP

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
// Listen for errors from OBS
obs.on('error', err => {
  console.error('OBS socket error:', err);
});

// Initialize Twitch chat hooks
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
                  editorChat.say(to, '!volume 50');
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

// Initialize Stream automation
const streamInit = (config, obs, twitch) => {
  return new Promise((resolve, reject) => {
    console.log(`Setting up initial video queue...`);
    // @TODO: Choose X random vods to start
    // Shuffle the vods and pick the first X
    let videoQueue = config.vods.sort( function() { return 0.5 - Math.random() } ).slice(0, 3);
    console.log(`Initial queue: ${JSON.stringify(videoQueue)}`);
    // @TODO: Load the first vod into the source, show it, listen to event of it being done, load the next, etc.

    console.log(`Initializing stream timers...`);
  
    // When: Every 4 hours at 55 past
    // @TODO: change to a random interval of time!
    // What: AUW
    let auwJob = schedule.scheduleJob("55 */4 * * *", () => {
      // AUW
      //twitch.editorChat.say(twitchChannel, `${config.twitch.cmdPrefix}auw`);
    });
    //console.log(`AUW is scheduled to be shown at ${auwJob.nextInvocation()}`);

    let userVotes = [];
    let currentChoices = [];
    let rockTheVote;
    
    let videoVoteJob = schedule.scheduleJob("*/1 * * * *", () => {
      // Tally votes from previous election (if there was one), add the winner to the queue
      let winner;
      if (currentChoices.length > 0)
      {
        if (userVotes.length === 0)
        {
          // choose a random element from currentChoices
          winner = util.randElement(currentChoices);
          console.log(`VIDEO CHOSEN RANDOMLY: ${winner.chatName}`);
          //twitch.botChat.say(twitchChannel, `No Votes Logged -- Next Playlist Chosen at Random: ${winner.chatName}`);
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
          winner = currentChoices[voteTallies[0].id-1];
          console.log(`WINNER OF THE VOTE: ${winner.chatName}`);
          //twitch.botChat.say(twitchChannel, `Winner of the Video Vote: ${winner.chatName}`);

          // clear user votes
          userVotes = [];
        }

        videoQueue.push[winner];
      }
      
      // choose 10 more random videos from config.vods (that aren't already in the queue)
      let vodsNotInQueue = config.vods.filter(e => {
        return (videoQueue.findIndex(q => q.id === e.id) === -1);
      });
      currentChoices = vodsNotInQueue.sort( function() { return 0.5 - Math.random() } ).slice(0, 10);

      // post choices to chat + set reminders to post every 5 minutes
      let chatChoices = currentChoices.map((c, i) => {
        return `[${i+1}] ${c.chatName}`;
      });

      rockTheVote = () => {
        console.log(`Vote for which video you'd like to add to the queue using ${config.twitch.cmdPrefix}vote #: ${chatChoices.join(' | ')}`);
        //twitch.botChat.say(twitchChannel, `Vote for which video you'd like to see next using ${config.twitch.cmdPrefix}vote #: ${chatChoices.join(' | ')}`)
      };
      //setInterval(rockTheVote, 300000);
      rockTheVote();
    });

    // Track user votes for video queue
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
            return rockTheVote();
          }

          userVote = Number.parseInt(userVote);

          if (!Number.isInteger(userVote) || userVote < 1 || userVote > currentChoices.length) {
            return twitch.botChat.say(to, `@${from}, please choose an option from 1 - ${currentChoices.length}!`);
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

    resolve(videoQueue);
  });
}

// catches Promise errors
process.on('unhandledRejection', console.error);
