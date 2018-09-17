/**
 * FG.fm Automation
 */

// Import modules
const irc = require('irc');
const OBSWebSocket = require('obs-websocket-js');
const schedule = require('node-schedule');
const util = require('./lib/util');

// Read internal configuration
let config = require('./config.json');
const snesGames = require('./conf/snesgames.json');
const twitchChannel = config.twitch.channels[0].toLowerCase();

let videoQueue = recentlyPlayed = [];
let currentVideo;
let videoTimer;

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
  console.error(`OBS socket error: ${JSON.stringify(err)}`);
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

          // SHOW/HIDE SOURCE
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
          // TOGGLE SOURCE VISIBILITY
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
          // SWAP -- Hide one source, show another
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
          // Black Box "Everybody Wow" "commercial"
          } else if (commandNoPrefix === 'auw') {
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
          // SWITCH SCENES
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
          // SET ON-SCREEN ACTIVITY
          } else if (commandNoPrefix === 'setactivity') {
            let target = commandParts.slice(1).join(' ');
            if (!target) {
              twitchChat.say(to, `Please provide a new activity`);
              return;
            }

            obs.setTextGDIPlusProperties({"source": config.currentActivitySceneItemName, "scene-name": config.videoSceneName, "render": true, "text": target})
              .then(res => {
                twitchChat.say(to, `Activity updated!`);
                return;
              })
              .catch(console.error);
          // REBOOT
          } else if (commandNoPrefix === 'reboot') {
            console.log('Received request from admin to reboot...');
            twitchChat.say(to, 'Rebooting...');
            process.exit(0);
          }
        }

        // Listen for commands from everyone else
        if (commandNoPrefix === 'rngames') {
          twitchChat.say(to, snesGames.sort( () => { return 0.5 - Math.random() } ).slice(0, 10).join(' | '));
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
    videoQueue = config.vods.sort( () => { return 0.5 - Math.random() } ).slice(0, config.initialQueueSize);
    console.log(`Initial queue: ${videoQueue.map((c, i) => `[${i+1}] ${c.chatName}`).join(' | ')}`);   
    currentVideo = videoQueue.shift();

    // Pick the next video in the queue (or shuffle if queue is empty)
    const nextVideo = () => {
      // add currentVideo.id to recentlyPlayed list, remove oldest video if cap is hit
      if (recentlyPlayed.length === 3) {
        recentlyPlayed.shift();
      }
      recentlyPlayed.push(currentVideo.id);

      // @TODO: Add a random chance here for room grind to be played for an amount of time
      

      // play the next video in the queue, or pick one at random if the queue is empty
      if (videoQueue.length > 0) {
        currentVideo = videoQueue.shift();
      } else {
        // filter recently played from shuffle
        let freshVods = config.vods.filter(e => {
          return !recentlyPlayed.includes(e.id);
        });
        currentVideo = freshVods.sort( () => { return 0.5 - Math.random() } ).slice(0, 1).shift();
      }
      showVideo(currentVideo);
    };

    // Show a video and hide it when finished
    const showVideo = video => {
      console.log(`Showing video: ${video.chatName}`);
      // set the file path
      obs.setSourceSettings({"sourceName": video.sceneItem, "sourceSettings": {"local_file": video.filePath}})
        .then(data => {
          // show the video
          return obs.setSceneItemProperties({"item": video.sceneItem, "scene-name": config.videoSceneName, "visible": true});
        })
        .then(data => {
          // update activity label and show/hide appropriately
          if (video.label !== false) {
            return obs.setTextGDIPlusProperties({"source": config.currentActivitySceneItemName, "scene-name": config.videoSceneName, "render": true, "text": video.label});
          } else {
            return obs.setSceneItemProperties({"item": config.currentActivitySceneItemName, "scene-name": config.videoSceneName, "visible": false});
          }
        })
        .then(data => {
          // hide this video when it's finished and play the next video
          videoTimer = setTimeout(() => {
            obs.setSceneItemProperties({"item": video.sceneItem, "scene-name": config.videoSceneName, "visible": false})
              .then(data => {
                nextVideo();
              });
          }, video.length*1000)
        })       
        .catch(console.error);
    };

    showVideo(currentVideo);

    console.log(`Initializing stream timers...`);
  
    let userVotes = currentChoices = [];
    let rockTheVote = () => {};
    let rtvInterval = setInterval(() => {rockTheVote()}, 300000);
    
    let videoVoteJob = new schedule.Job(() => {
      // Tally votes from previous election (if there was one), add the winner to the queue
      let winner;
      if (currentChoices.length > 0) {
        if (userVotes.length === 0) {
          // choose a random element from currentChoices
          winner = util.randElement(currentChoices);
          console.log(`VIDEO CHOSEN RANDOMLY: ${winner.chatName}`);
          twitch.botChat.say(twitchChannel, `No Votes Logged -- Next Video Chosen at Random: ${winner.chatName}`);
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
          twitch.botChat.say(twitchChannel, `Winner of the Video Vote: ${winner.chatName}`);

          // clear user votes
          userVotes = [];
        }

        videoQueue.push(winner);
      }
      
      // choose more random videos from config.vods (that aren't already in the queue)
      let vodsNotInQueue = config.vods.filter(e => {
        let inQueue = videoQueue.findIndex(q => q.id === e.id) !== -1;
        return !inQueue;
      });
      currentChoices = vodsNotInQueue.sort( () => { return 0.5 - Math.random() } ).slice(0, config.videoPollSize);

      // Poll the chat
      let chatChoices = currentChoices.map((c, i) => {
        return `[${i+1}] ${c.chatName}`;
      });

      rockTheVote = () => {
        twitch.botChat.say(twitchChannel, `Vote for which video you'd like to add to the queue using ${config.twitch.cmdPrefix}vote #: ${chatChoices.join(' | ')}`)
      };
      clearInterval(rtvInterval);
      rockTheVote();
      rtvInterval = setInterval(() => {rockTheVote()}, 300000);
    });

    // Twitch Chat Commands for Video Queue Control
    twitch.botChat.addListener('message', (from, to, message) => {
       // Ignore everything from blacklisted users
      if (config.twitch.blacklistedUsers.includes(from)) return;

      // Listen for commands that start with the designated prefix
      if (message.startsWith(config.twitch.cmdPrefix)) {
        let commandParts = message.slice(config.twitch.cmdPrefix.length).split(' ');
        let commandNoPrefix = commandParts[0] || '';

        // ADMIN COMMANDS
        if (config.twitch.admins.includes(from) || from === config.twitch.username.toLowerCase()) {
          // SKIP
          if (commandNoPrefix === 'skip') {
            clearTimeout(videoTimer);
            obs.setSceneItemProperties({"item": currentVideo.sceneItem, "scene-name": config.videoSceneName, "visible": false})
              .then(res => {
                nextVideo();
              });
          // ADD
          } else if (commandNoPrefix === 'add') {
            let requestedVideoId = commandParts[1] || false;
            if (requestedVideoId === false) {
              twitch.botChat.say(to, `Missing video ID`);
              return;
            }

            // make sure request vid isn't in the queue already
            if (videoQueue.findIndex(e => e.id == requestedVideoId) !== -1) {
              twitch.botChat.say(to, `That video is in the queue already!`);
              return;
            }

            // search for req'd vid by id in config.vods
            let vodIndex = config.vods.findIndex(e => e.id == requestedVideoId);
            if (vodIndex === -1) {
              twitch.botChat.say(to, `A video with that ID does not exist!`);
              return;
            }

            // add to queue if it exists
            videoQueue.push(config.vods[vodIndex]);
            twitch.botChat.say(to, `${config.vods[vodIndex].chatName} has been added to the queue [${videoQueue.length}]`);
            return;
          // START VOTE
          } else if (commandNoPrefix === 'startvote') {
            videoVoteJob.reschedule("*/15 * * * *");
            twitch.botChat.say(to, `Voting has been started. Next run: ${videoVoteJob.nextInvocation()}`);
          // PAUSE VOTE
          } else if (commandNoPrefix === 'pausevote') {
            clearInterval(rtvInterval);
            videoVoteJob.cancel();
            twitch.botChat.say(to, `Voting has been paused.`);
          }
        }
        ////////////////

        // USER COMMANDS
        // 
        // VOTE FOR VIDEO
        if (commandNoPrefix === 'vote') {
          let userVote = commandParts[1] || false;

          if (userVote === false) {
            rockTheVote();
            return;
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
        // QUEUE STATUS
        } else if (commandNoPrefix === 'queue') {
          if (videoQueue.length > 0) {
            let chatQueue = videoQueue.map((c, i) => {
              return `[${i+1}] ${c.chatName}`;
            });
            twitch.botChat.say(to, chatQueue.join(' | '));
          } else {
            twitch.botChat.say(to, `No videos currently in queue!`);
          }
        // CURRENT VIDEO
        } else if (commandNoPrefix === 'current') {
          twitch.botChat.say(to, `Now Playing: ${currentVideo.chatName}`);
        // NEXT VIDEO
        } else if (commandNoPrefix === 'next') {
          if (videoQueue.length > 0) {
            twitch.botChat.say(to, `Next Video: ${videoQueue[0].chatName}`);
          } else {
            twitch.botChat.say(to, `No videos currently in queue!`);
          }
        // VIDEO REQUEST
        } else if (commandNoPrefix === 'vr') {
          let requestedVideoId = commandParts[1] || false;
          if (requestedVideoId === false) {
            twitch.botChat.say(to, `Useage: ${config.twitch.cmdPrefix}vr <video-id> | Videos: https://pastebin.com/qv0wDkvB`);
            return;
          }

          // make sure request vid isn't in the queue already
          if (videoQueue.findIndex(e => e.id === requestedVideoId) !== -1) {
            twitch.botChat.say(to, `That video is in the queue already!`);
            return;
          }

          // search for req'd vid by id in config.vods
          let vodIndex = config.vods.findIndex(e => e.id === requestedVideoId);
          if (vodIndex === -1) {
            twitch.botChat.say(to, `A video with that ID does not exist!`);
            return;
          }

          // add to queue if it exists
          videoQueue.push(config.vods[vodIndex]);
          twitch.botChat.say(to, `${config.vods[vodIndex].chatName} has been added to the queue [${videoQueue.length}]`);
          return;
        }
        ////////////////
      }
    });

    resolve(videoQueue);
  });
}

// catches Promise errors
process.on('unhandledRejection', console.error);
