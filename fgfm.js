/**
 * FG.fm Automation
 */

// Import 3rd party packages
const irc = require('irc');
const schedule = require('node-schedule');
const md5 = require('md5');
const moment = require('moment');

// Import local packages
const GHOBS = require('./lib/ghobs');
const FGFM = require('./lib/fgfm');
const cooldowns = require('./lib/cooldowns');
const util = require('./lib/util');

// Read internal configuration
let config = require('./config.json');
config.vods = require(config.vodConfigFile);
config.rooms = require(config.roomConfigFile);
let snesGames = require('./conf/snesgames.json');
let timersList = require('./conf/timers.json');

let activeTimers = [];
let skipVote = {
  target: null,
  count: 0
};
// @TODO: Move to config
config.skipVoteThreshold = 2;

// Main screen turn on
const obs = new GHOBS(config);
obs.init()
.then(() => twitchInit(config.twitch))
.then(twitch => streamInit(config, twitch))
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

    resolve({"botChat": botChat, "editorChat": editorChat, "controlRoom": controlRoom});
  });
};

// Initialize Stream automation
const streamInit = (config, twitch) => {

  // All your comfy are belong to us
  const director = new FGFM({config: config, obs: obs});
  
  // Chat commands
  const commands = {
    admin: {

      init: (cmd) => {
        let delaySeconds = cmd.args[1] || 300;

        director.startingSoon(delaySeconds);
      },


      start: (cmd) => {
        director.startTheShow();
      },


      end: (cmd) => {
        let creditsDelay = cmd.args[1] || 0;
        let endDelay = cmd.args[2] || 60;
        director.endTheShow(creditsDelay, endDelay);
      },


      changevis: (cmd, newVisibility) => {
        let sceneItem = command.args[1] || false;
        if (!sceneItem) {
          twitch.botChat.say(cmd.to, `A scene item name is required!`);
          return;
        }

        let sceneOrGroup = command.args[2] || obs.currentScene;
        obs.setVisible(sceneItem, sceneOrGroup, newVisibility).catch(console.error);
      },


      show: (cmd) => {
        commands.admin.changevis(cmd, true);
      },


      hide: (cmd) => {
        commands.admin.changevis(cmd, false);
      },


      t: (cmd) => {
        let sceneItem = cmd.args[1] || false;
        if (!sceneItem) {
          twitch.botChat.say(cmd.to, `A scene item name is required!`);
          return;
        }

        obs.toggleVisible(sceneItem).catch(console.error);
      },


      timer: (cmd) => {
        let timerName = cmd.args[1] || false;
        if (!timerName) {
          twitch.botChat.say(cmd.to, `A timer name is required!`);
          return;
        }

        // search timers for matching name
        let theTimerIndex = timersList.findIndex(e => e.name === timerName);
        if (theTimerIndex === -1) {
          twitch.botChat.say(cmd.to, `Invalid timer name!`);
          return; 
        }

        let theTimer = timersList[theTimerIndex];

        // look in activeTimers for current status
        let currentTimerIndex = activeTimers.findIndex(e => e.name === timerName);
        
        let timerStatus = cmd.args[2] || false;
        if (!timerStatus || timerStatus !== 'on' || timerStatus !== 'off') {
          // toggle by default
          if (currentTimerIndex === -1) {
            timerStatus = 'on';
          } else {
            timerStatus = 'off';
          }
        }
      
        if (currentTimerIndex === -1 && timerStatus === 'on') {
          let timerFunc = () => {
            twitch.botChat.say(config.twitch.channel, theTimer.value);
          };
          let timerInterval = setInterval(timerFunc, theTimer.interval*1000);
          activeTimers.push({name: theTimer.name, timer: timerInterval});
          timerFunc();
        } else if (timerStatus === 'off') {
          clearInterval(activeTimers[currentTimerIndex].timer);
          activeTimers.splice(currentTimerIndex, 1);
        }
      },


      auw: (cmd) => {
        director.showMeme('auw');
      },


      meme: (cmd) => {
        let memeId = cmd.args[1] || false;
        if (memeId) {
          console.log(`${memeId} meme requested by ${cmd.from}`);
          if ( config.vods.memes.findIndex(e => e.id === memeId) === -1) {
            twitch.botChat.say(cmd.to, `No meme with that ID exists!`);
            return;
          }
        } else {
          memeId = config.vods.memes.sort(util.randSort)[0].id;
          console.log(`${memeId} meme randomly selected`);
        }

        director.showMeme(memeId);
      },


      switch: (cmd) => {
        let newScene = cmd.args[1] || false;
        if (!newScene) {
          twitch.botChat.say(cmd.to, `A scene name is required!`);
          return;
        }

        obs.switchToScene(newScene).catch(console.error);
      },


      setact: (cmd) => {
        let newActivity = cmd.args.slice(1).join(' ');
        if (!newActivity) {
          twitch.botChat.say(cmd.to, `Please provide a new activity`);
          return;
        }

        obs.showActivity(newActivity).catch(console.error);
      },


      showact: (cmd) => {
        obs.showActivity().catch(console.error);
      },


      hideact: (cmd) => {
        obs.hideActivity().catch(console.error);
      },


      add: (cmd) => {
        // @TODO: DRY this out with the checks in vr
        let requestedVideoId = cmd.args[1] || false;
        if (requestedVideoId === false) {
          twitch.botChat.say(cmd.to, `Missing video ID`);
          return;
        }

        // make sure request vid isn't in the queue already
        // @TODO: Move into FGFM
        if (director.state.videoQueue.findIndex(e => e.id == requestedVideoId) !== -1) {
          twitch.botChat.say(cmd.to, `That video is in the queue already!`);
          return;
        }

        // search for req'd vid by id in config.vods.alttp
        let vodIndex = config.vods.alttp.findIndex(e => e.id == requestedVideoId);
        if (vodIndex === -1) {
          twitch.botChat.say(cmd.to, `A video with that ID does not exist!`);
          return;
        }

        // add to queue if it exists
        // @TODO: Move into FGFM
        if (director.addVideo(config.vods.alttp[vodIndex])) {
          twitch.botChat.say(cmd.to, `${config.vods.alttp[vodIndex].chatName} has been added to the queue [${director.state.videoQueue.length}]`);
        } else {
          twitch.botChat.say(cmd.to, `Video could not be added to queue!`);
        }      
      },


      skip: (cmd) => {
        director.skip();
      },


      pause: (cmd) => {
        director.pause();
      },


      resume: (cmd) => {
        director.resume();
      },


      clear: (cmd) => {
        director.clearQueue();
      },


      startvote: (cmd) => {
        videoVoteJob.reschedule(`*/${config.videoPollIntervalMinutes} * * * *`);
        twitch.botChat.say(cmd.to, `Video Queue Voting will start in ${config.videoPollIntervalMinutes} minutes!`);
      },


      pausevote: (cmd) => {
        clearInterval(rtvInterval);
        videoVoteJob.cancel();
        twitch.botChat.say(cmd.to, `Video Queue Voting has been paused.`);
      },


      reboot: (cmd) => {
        console.log('Received request from admin to reboot...');
        twitch.botChat.say(cmd.to, 'Rebooting...');
        process.exit(0); // requires process manager with autoreboot to work
      }
    },

    user: {

      vote: (cmd) => {
        let userVote = cmd.args[1] || false;

        if (userVote === false) {
          rockTheVote();
          return;
        }

        userVote = Number.parseInt(userVote);

        if (!Number.isInteger(userVote) || userVote < 1 || userVote > currentChoices.length) {
          return twitch.botChat.say(cmd.to, `@${from}, please choose an option from 1 - ${currentChoices.length}!`);
        }

        // Check for uniqueness of vote
        // if it's not unique, update the vote
        let prevVote = userVotes.findIndex(e => e.from === from);
        if (prevVote !== -1) {
          if (userVotes[prevVote].vote !== userVote) {
            // update vote and inform the user
            userVotes[prevVote].vote = userVote;
            twitch.botChat.say(cmd.to, `@${from}, your vote has been updated!`);
          } else {
            twitch.botChat.say(cmd.to, `@${from}, your vote is already in!`);
          }
        } else {
          // log user vote
          userVotes.push({"from": from, "vote": userVote});
          twitch.botChat.say(cmd.to, `@${from}, your vote has been logged!`);
        }
      },


      queue: (cmd) => {
        // @TODO: Move into FGFM
        if (director.state.videoQueue.length > 0) {
          let chatQueue = director.state.videoQueue.slice(0, 10).map((c, i) => {
            return `[${i+1}] ${c.chatName}`;
          });
          twitch.botChat.say(cmd.to, chatQueue.join(' | '));
        } else {
          twitch.botChat.say(cmd.to, `No videos currently in queue!`);
        }
      },


      current: (cmd) => {
        // @TODO: Move retrieval of currentVideo into FGFM
        twitch.botChat.say(cmd.to, `Now Playing: ${director.state.currentVideo.chatName}`);
      },


      next: (cmd) => {
        // @TODO: Move retrieval of videoQueue into FGFM
        if (director.state.videoQueue.length > 0) {
          twitch.botChat.say(cmd.to, `Next Video: ${director.state.videoQueue[0].chatName}`);
        } else {
          twitch.botChat.say(cmd.to, `No videos currently in queue!`);
        }
      },


      vr: (cmd) => {
        let requestedVideoId = cmd.args[1] || false;
        if (requestedVideoId === false) {
          twitch.botChat.say(cmd.to, `Useage: ${config.twitch.cmdPrefix}vr <video-id> | Videos: https://pastebin.com/qv0wDkvB`);
          return;
        }

        // make sure request vid isn't in the queue already
        // @TODO: Move check into FGFM
        if (director.state.videoQueue.findIndex(e => e.id === requestedVideoId) !== -1) {
          twitch.botChat.say(cmd.to, `That video is in the queue already!`);
          return;
        }

        // search for req'd vid by id in config.vods.alttp
        let vodIndex = config.vods.alttp.findIndex(e => e.id === requestedVideoId);
        if (vodIndex === -1) {
          twitch.botChat.say(cmd.to, `A video with that ID does not exist!`);
          return;
        }

        // @TODO: Make sure user hasn't met the request limit

        config.vods.alttp[vodIndex].requestedBy = cmd.from;

        // add to queue if it exists
        // @TODO: Return queue position from addVideo
        if (director.addVideo(config.vods.alttp[vodIndex])) {
          twitch.botChat.say(cmd.to, `${config.vods.alttp[vodIndex].chatName} has been added to the queue [${director.state.videoQueue.length}]`);  
        } else {
          twitch.botChat.say(cmd.to, `${config.vods.alttp[vodIndex].chatName} could not be added to the queue!`);  
        }        
      },


      room: (cmd) => {
        let roomId = cmd.args[1] || false;
        let room;
        
        if (roomId !== false) {
          let roomIndex = config.rooms.findIndex(e => e.id === parseInt(roomId));
          
          if (roomIndex === -1) {
            twitch.botChat.say(cmd.to, `No room found matching that ID!`);
            return;
          }

          room = config.rooms[roomIndex];
        } else {
          twitch.botChat.say(cmd.to, `Useage: ${config.twitch.cmdPrefix}room <room-id> | Rooms: https://goo.gl/qoNmuH`);
          return;
        }

        // @TODO: Make sure user hasn't met the request limit

        room.requestedBy = cmd.from;

        director.addRoomVideo(room);
        // @TODO: Return new queue position from addRoomVideo and use below
        twitch.botChat.say(cmd.to, `Added ${room.dungeonName||'?'} - ${room.roomName||'?'} to the queue [${director.state.videoQueue.length}]!`);
      },


      rngames: (cmd) => {
        twitch.botChat.say(cmd.to, snesGames.sort(util.randSort).slice(0, 10).join(' | '));
      },


      // voting to skip current video
      skip: (cmd) => {
        // check if there is an existing vote to skip for the director.state.currentVideo
        if (skipVote.target === director.state.currentVideo.id) {
          // if yes, add the vote, check if threshold is met, skip if necessary
          skipVote.count++;
        } else {
          skipVote.target = director.state.currentVideo.id;
          skipVote.count = 1;
        }

        if (skipVote.count >= config.skipVoteThreshold) {
          director.skip();
          skipVote.target = null;
        }
      },
    }
  };

  // Listen for the above commands
  twitch.botChat.addListener('message', (from, to, message) => {
    // Ignore everything from blacklisted users
    if (config.twitch.blacklistedUsers.includes(from)) return;

    // Ignore commands that don't start with the designated prefix
    if (!message.startsWith(config.twitch.cmdPrefix)) return;

    // Remove command prefix for parsing
    let noPrefix = message.slice(config.twitch.cmdPrefix.length);

    // Ignore blank commands
    if (noPrefix.length === 0) return;

    // Parse command arguments
    let args = noPrefix.split(' ');
    let key = args[0] || '';

    // Ignore messages without a command
    if (!key || key.length === 0) return;

    // Ignore unrecognized commands
    if (!commands.admin.hasOwnProperty(key) && !commands.user.hasOwnProperty(key)) return;

    // Check if the command is on cooldown for this user in this channel (admins bypass this)
    let cooldownKey = md5(from+to+key);
    cooldowns.get(cooldownKey, config.twitch.defaultUserCooldown)
    .then(onCooldown => {
      if (onCooldown === false || config.twitch.admins.includes(from)) {
        let command = {message: message, from: from, to: to, key: key, args: args};

        // Handle admin commands
        if (commands.admin.hasOwnProperty(command.key) && config.twitch.admins.includes(from)) {
          return commands.admin[command.key](command);
        }

        // Handle all other user commands
        if (commands.user.hasOwnProperty(command.key)) {
          // Place this command on cooldown for the user
          cooldowns.set(cooldownKey, config.twitch.defaultUserCooldown);
          return commands.user[command.key](command);
        }
      }
    })
    .catch(console.error);
  });



  // @TODO: Modularize timed events
  //console.log(`Initializing stream timers...`);
  let userVotes = currentChoices = [];
  let rockTheVote = () => {};
  // @TODO: Move this interval to config
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

      director.addVideo(winner);
    }
    
    // choose more random videos from config.vods.alttp (that aren't already in the queue)
    // @TODO: Move into FGFM
    let vodsNotInQueue = config.vods.alttp.filter(e => {
      let inQueue = (director.state.videoQueue.findIndex(q => q.id === e.id) !== -1) && (director.state.currentVideo.id !== e.id);
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
};

const startTimer = (timer) => {
  setInterval(() => {
    
  }, timer.interval*1000);
};

// catches Promise errors
process.on('unhandledRejection', console.error);
