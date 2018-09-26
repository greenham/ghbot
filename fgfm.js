/**
 * FG.fm Automation
 */

// Import modules
const irc = require('irc');
const schedule = require('node-schedule');
const util = require('./lib/util');
const GHOBS = require('./lib/ghobs');

// Read internal configuration
let config = require('./config.json');
config.vods = require(config.vodConfigFile);
config.rooms = require(config.roomConfigFile);
let snesGames = require('./conf/snesgames.json');

// Set up initial state
let state = {
  "videoQueue": [],
  "recentlyPlayed": [],
  "currentVideo": null,
  "videoTimer": null,
  "lastCommercialShownAt": Date.now(),
  "commercialPlaying": false
};

const obs = new GHOBS(config);
obs.init()
  .then(() => {return twitchInit(config.twitch)})
  .then(twitch => {return streamInit(config, twitch)})
  .catch(console.error);

// Connect to twitch, set up basic event listeners
const twitchInit = (config) => {
  return new Promise((resolve, reject) => {
    let controlRoom = `#chatrooms:${config.channelId}:${config.controlRoomId}`;

    console.log(`Connecting to Twitch / ${config.channel} / ${controlRoom}`);

    let defaultTwitchConfig = {
      autoRejoin: true,
      retryCount: 10,
      channels: [config.channel, controlRoom],
      debug: config.debug
    };

    // Connect to Twitch with the bot account
    let botChat = new irc.Client(
      config.ircServer, 
      config.botLogin.username, 
      Object.assign({password: config.botLogin.oauth}, defaultTwitchConfig)
    );

    // Connect to Twitch with an editor account
    let editorChat = new irc.Client(
      config.ircServer, 
      config.editorLogin.username, 
      Object.assign({password: config.editorLogin.oauth}, defaultTwitchConfig)
    );

    let twitchErrorHandler = message => {
      if (message.command != 'err_unknowncommand') {
        console.error('Error from Twitch IRC Server: ', message);
      }
    };

    // Set up bare minimum event listeners for Twitch
    botChat.addListener('error', twitchErrorHandler);
    editorChat.addListener('error', twitchErrorHandler);

    resolve({"botChat": botChat, "editorChat": editorChat});
  });
};

// Initialize Stream automation
const streamInit = (config, twitch) => {
  return new Promise((resolve, reject) => {
    // Set up initial queue + start playback
    const init = () => {
      // Set up the initial queue by randomly choosing the configured amount of vods included in shuffling
      state.videoQueue = config.vods.alttp.filter(e => e.includeInShuffle === true).sort(util.randSort).slice(0, config.initialQueueSize);
      console.log(`Initial video queue: ${state.videoQueue.map((c, i) => `[${i+1}] ${c.chatName}`).join(' | ')}`);   

      // Start queue playback
      state.currentVideo = state.videoQueue.shift();
      showVideo(state.currentVideo);
    }

    // Show a gameplay vod
    const showVideo = video => {
      console.log(`Showing video: ${video.chatName}`);

      obs.playVideoInScene(video, config.defaultSceneName, nextVideo)
        .then(timer => {
          // track timer so we can cancel callback later on if necessary
          state.videoTimer = timer;

          // update activity label and show/hide appropriately
          if (video.hasOwnProperty('label') && video.label !== false) {
            obs.showActivity(video.label);
          } else {
            obs.hideActivity();
          }
        })
        .catch(console.error);
    };

    const addRoomVideo = (room, loop) => {
      if (Array.isArray(room)) {
        for (var i = 0; i < room.length; i++) {
          return addRoomVideo(room[i], loop);
        }
      }

      let loops = 1;
      if (typeof loop === 'undefined' || loop === true) {
        loops = Math.floor(config.roomVidPlaytime / room.videoData.length);
      }
      console.log(`Adding ${loops} instances of room video for ${room.dungeonName} - ${room.roomName} to the queue`);

      let video = {
        "filePath": `${config.roomVidsBasePath}${room.winPath}`,
        "sceneItem": (room.videoData.width === 960) ? "4x3ph" : "16x9ph",
        "length": room.videoData.length,
        "label": room.roomName,
        "chatName": room.roomName
      };

      for (var i = 0; i < loops; i++) {
        state.videoQueue.push(video);
      }
    };

    // Picks the next video in the queue (shuffles if empty)
    // Also handles "commercial breaks" if enabled
    const nextVideo = () => {
      // Show a "commercial break" if it's been long enough since the last one
      let secondsSinceLastCommercial = (Date.now() - state.lastCommercialShownAt) / 1000;
      if (config.commercialsEnabled === true && secondsSinceLastCommercial >= config.commercialInterval) {
        state.commercialPlaying = true;
        console.log(`It has been ${secondsSinceLastCommercial} seconds since the last commercial break!`);
        // Random chance for it to be "everybody wow"
        let memeId = false;
        if ((Math.floor(Math.random() * 100) + 1) <= config.auwChance) {
          console.log(`Showing AUW!`);
          memeId = 'auw';
        }
        showMeme(memeId).then(() => {
          state.lastCommercialShownAt = Date.now();
          state.commercialPlaying = false;
          nextVideo();
        }).catch(console.error);
          
        return;
      }

      // Keep track of recently played videos
      if (state.recentlyPlayed.length === config.recentlyPlayedMemory) {
        state.recentlyPlayed.shift();
      }
      state.recentlyPlayed.push(state.currentVideo.id);

      // If a commercial is playing, wait until it's done to switch
      while (state.commercialPlaying === true) {}

      // play the next video in the queue, or pick one at random if the queue is empty
      if (state.videoQueue.length > 0) {
        state.currentVideo = state.videoQueue.shift();
      } else {
        // Random chance for room grind to be played for an amount of time instead of another video be shuffled to
        if ((Math.floor(Math.random() * 100) + 1) <= config.roomGrindChance) {
          console.log(`Room grind selected!`);
          // show room-grind source
          obs.showRoomGrind(config.roomGrindPlaytime, () => {nextVideo()})
            .then(timer => {
              videoTimer = timer;
            })
            .catch(console.error);

          return;
        }

        // Random chance for room videos to be added
        if ((Math.floor(Math.random() * 100) + 1) <= config.roomShuffleChance) {
          console.log(`Room vids selected!`);

          let roomVid = config.rooms.sort(util.randSort).slice(0, 1);

          addRoomVideo(roomVid);

          // play the first one
          state.currentVideo = state.videoQueue.shift();
        } else {
          // filter recently played from shuffle
          let freshVods = config.vods.alttp.filter(e => {
            return e.includeInShuffle === true && !state.recentlyPlayed.includes(e.id);
          });
          state.currentVideo = freshVods.sort(util.randSort).slice(0, 1).shift();
        }
      }
      
      showVideo(state.currentVideo);
    };

    // "Commercials"
    const showCommercial = (video, callback) => {
      return new Promise((resolve, reject) => {
        let handleFinish = () => {
          // unmute songrequest audio
          //twitch.editorChat.say(config.twitch.channel, `!volume ${config.defaultSRVolume}`);
          if (typeof callback !== 'undefined') callback();
        };

        obs.playVideoInScene(video, config.commercialSceneName, handleFinish)
          .then(timer => {
            // mute songrequest audio
            //twitch.editorChat.say(config.twitch.channel, `!volume 0`);
            resolve(timer);
          })
          .catch(reject);
      });
    };

    // Memes-By-Id
    const showMeme = (id) => {
      return new Promise((resolve, reject) => {
        // find the vod in memes
        let video = config.vods.memes.find(e => e.id === id);
        if (!video) {
          reject(`No meme found matching ID ${id}`);
        }

        let handleFinish = () => {
          if (id === 'auw') {
            obs.hide("owen", config.commercialSceneName);
          }
          resolve();
        };

        showCommercial(video, handleFinish)
          .then(videoHasStarted => {
            // in the case of 'auw', show owen + tell chat what's up
            if (id === 'auw') {
              obs.show("owen", config.commercialSceneName);
              twitch.botChat.say(config.twitch.channel, 'Everybody OwenWow');
            }
          })
          .catch(console.error);
      });
    };

    // Twitch Chat Commands
    twitch.botChat.addListener('message', (from, to, message) => {
       // Ignore everything from blacklisted users
      if (config.twitch.blacklistedUsers.includes(from)) return;

      // Listen for commands that start with the designated prefix
      if (message.startsWith(config.twitch.cmdPrefix)) {

        let commandParts = message.slice(config.twitch.cmdPrefix.length).split(' ');
        let commandNoPrefix = commandParts[0] || '';  

        // ADMIN COMMANDS
        if (config.twitch.admins.includes(from) || from === config.twitch.username.toLowerCase()) {

          // SHOW/HIDE SOURCE
          if (commandNoPrefix === 'show' || commandNoPrefix === 'hide') {
            let newVisibility = (commandNoPrefix === 'show');

            let sceneItem = commandParts[1] || false;
            if (!sceneItem) {
              twitch.botChat.say(to, `A scene item name is required!`);
              return;
            }

            let sceneOrGroup = commandParts[2] || obs.currentScene;
            obs.setVisible(sceneItem, sceneOrGroup, newVisibility).catch(console.error);
       
          // TOGGLE SOURCE VISIBILITY
          } else if (commandNoPrefix === 't') {
            let sceneItem = commandParts[1] || false;
            if (!sceneItem) {
              twitch.botChat.say(to, `A scene item name is required!`);
              return;
            }

            obs.toggleVisible(sceneItem).catch(console.error);

          // ROOM VIDS
          } else if (commandNoPrefix === 'room') {
            let roomId = commandParts[1] || false;
            if (roomId.length !== 4) {
              twitch.botChat.say(to, `Please provide a 4-digit room ID!`);
              return;
            }

            let roomIndex = config.rooms.findIndex(e => e.dungeonId === roomId.substring(0,2) && e.roomId === roomId.substring(2,4));
            if (roomIndex === -1) {
              twitch.botChat.say(to, `No room found matching that ID!`);
              return;  
            }

            let room = config.rooms[roomIndex];
            addRoomVideo(room);
            twitch.botChat.say(to, `Added ${room.dungeonName} - ${room.roomName} to the queue!`);
         
          // EVERYBODY WOW
          } else if (commandNoPrefix === 'auw') {
            state.commercialPlaying = true;
            showMeme('auw').then(() => state.commercialPlaying = false).catch(console.error);

          // MEMES ON-DEMAND
          } else if (commandNoPrefix === 'meme') {
            let memeId = commandParts[1] || false;
            if (memeId) {
              console.log(`${memeId} meme requested`);
              if ( config.vods.memes.findIndex(e => e.id === memeId) === -1) {
                twitch.botChat.say(to, `No meme with that ID exists!`);
                return;
              }
            } else {
              memeId = config.vods.memes.sort(util.randSort)[0].id;
              console.log(`${memeId} meme randomly selected`);
            }

            state.commercialPlaying = true;
            showMeme(memeId).then(() => state.commercialPlaying = false).catch(console.error);
          
          // SWITCH SCENES
          } else if (commandNoPrefix === 'switch') {

            let newScene = commandParts[1] || false;
            if (!newScene) {
              twitch.botChat.say(to, `A scene name is required!`);
              return;
            }

            obs.switchToScene(newScene).catch(console.error);
          
          // SET ON-SCREEN ACTIVITY
          } else if (commandNoPrefix === 'setact') {
            let newActivity = commandParts.slice(1).join(' ');
            if (!newActivity) {
              twitch.botChat.say(to, `Please provide a new activity`);
              return;
            }

            obs.showActivity(newActivity).catch(console.error);
         
          // REBOOT
          } else if (commandNoPrefix === 'reboot') {
            console.log('Received request from admin to reboot...');
            twitch.botChat.say(to, 'Rebooting...');
            process.exit(0);
          
          // SKIP
          } else if (commandNoPrefix === 'skip') {
            clearTimeout(state.videoTimer);
            obs.hide(state.currentVideo.sceneItem, config.defaultSceneName).then(nextVideo).catch(console.error);
          
          // ADD
          } else if (commandNoPrefix === 'add') {
            let requestedVideoId = commandParts[1] || false;
            if (requestedVideoId === false) {
              twitch.botChat.say(to, `Missing video ID`);
              return;
            }

            // make sure request vid isn't in the queue already
            if (state.videoQueue.findIndex(e => e.id == requestedVideoId) !== -1) {
              twitch.botChat.say(to, `That video is in the queue already!`);
              return;
            }

            // search for req'd vid by id in config.vods.alttp
            let vodIndex = config.vods.alttp.findIndex(e => e.id == requestedVideoId);
            if (vodIndex === -1) {
              twitch.botChat.say(to, `A video with that ID does not exist!`);
              return;
            }

            // add to queue if it exists
            state.videoQueue.push(config.vods.alttp[vodIndex]);
            twitch.botChat.say(to, `${config.vods.alttp[vodIndex].chatName} has been added to the queue [${state.videoQueue.length}]`);
            return;
          
          // START VOTE
          } else if (commandNoPrefix === 'startvote') {
            videoVoteJob.reschedule(`*/${config.videoPollIntervalMinutes} * * * *`);
            twitch.botChat.say(to, `Video Queue Voting will start in ${config.videoPollIntervalMinutes} minutes!`);
          
          // PAUSE VOTE
          } else if (commandNoPrefix === 'pausevote') {
            clearInterval(rtvInterval);
            videoVoteJob.cancel();
            twitch.botChat.say(to, `Video Queue Voting has been paused.`);
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
            } else {
              twitch.botChat.say(to, `@${from}, your vote is already in!`);
            }
          } else {
            // log user vote
            userVotes.push({"from": from, "vote": userVote});
            twitch.botChat.say(to, `@${from}, your vote has been logged!`);
          }
        

        // QUEUE STATUS
        } else if (commandNoPrefix === 'queue') {
          if (state.videoQueue.length > 0) {
            let chatQueue = state.videoQueue.map((c, i) => {
              return `[${i+1}] ${c.chatName}`;
            });
            twitch.botChat.say(to, chatQueue.join(' | '));
          } else {
            twitch.botChat.say(to, `No videos currently in queue!`);
          }
        

        // CURRENT VIDEO
        } else if (commandNoPrefix === 'current') {
          twitch.botChat.say(to, `Now Playing: ${state.currentVideo.chatName}`);
        

        // NEXT VIDEO
        } else if (commandNoPrefix === 'next') {
          if (state.videoQueue.length > 0) {
            twitch.botChat.say(to, `Next Video: ${state.videoQueue[0].chatName}`);
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
          if (state.videoQueue.findIndex(e => e.id === requestedVideoId) !== -1) {
            twitch.botChat.say(to, `That video is in the queue already!`);
            return;
          }

          // search for req'd vid by id in config.vods.alttp
          let vodIndex = config.vods.alttp.findIndex(e => e.id === requestedVideoId);
          if (vodIndex === -1) {
            twitch.botChat.say(to, `A video with that ID does not exist!`);
            return;
          }

          // add to queue if it exists
          state.videoQueue.push(config.vods.alttp[vodIndex]);
          twitch.botChat.say(to, `${config.vods.alttp[vodIndex].chatName} has been added to the queue [${state.videoQueue.length}]`);
          return;
        
        // RNGAMES
        } else if (commandNoPrefix === 'rngames') {
          twitch.botChat.say(to, snesGames.sort(util.randSort).slice(0, 10).join(' | '));
        }
        ////////////////
      }
    });
  
    // @TODO: Modularize timed events
    console.log(`Initializing stream timers...`);
    let userVotes = currentChoices = [];
    let rockTheVote = () => {};
    let rtvInterval = setInterval(() => {rockTheVote()}, 300000);
    let videoVoteJob = new schedule.Job(async () => {
      // Tally votes from previous election (if there was one), add the winner to the queue
      let winner;
      if (currentChoices.length > 0) {
        if (userVotes.length === 0) {
          // choose a random element from currentChoices
          winner = util.randElement(currentChoices);
          console.log(`VIDEO CHOSEN RANDOMLY: ${winner.chatName}`);
          twitch.botChat.say(config.twitch.channel, `No Votes Logged -- Next Video Chosen at Random: ${winner.chatName}`);
        } else {
          // tally and sort votes
          let voteTallies = [];
          await util.asyncForEach(userVotes, async (vote) => {
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
          twitch.botChat.say(config.twitch.channel, `Winner of the Video Vote: ${winner.chatName}`);

          // clear user votes
          userVotes = [];
        }

        state.videoQueue.push(winner);
      }
      
      // choose more random videos from config.vods.alttp (that aren't already in the queue)
      let vodsNotInQueue = config.vods.alttp.filter(e => {
        let inQueue = state.videoQueue.findIndex(q => q.id === e.id) !== -1;
        return !inQueue;
      });
      currentChoices = vodsNotInQueue.sort(util.randSort).slice(0, config.videoPollSize);

      // Poll the chat
      let chatChoices = currentChoices.map((c, i) => {
        return `[${i+1}] ${c.chatName}`;
      });

      rockTheVote = () => {
        twitch.botChat.say(config.twitch.channel, `Vote for which video you'd like to add to the queue using ${config.twitch.cmdPrefix}vote #: ${chatChoices.join(' | ')}`)
      };
      clearInterval(rtvInterval);
      rockTheVote();
      rtvInterval = setInterval(() => {rockTheVote()}, 300000);
    });

    init();
    resolve(obs);
  });
};

// catches Promise errors
process.on('unhandledRejection', console.error);
