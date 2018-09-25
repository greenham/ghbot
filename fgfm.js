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
    console.log(`Connecting to Twitch / ${config.channel}...`);

    let defaultTwitchConfig = {
      autoRejoin: true,
      retryCount: 10,
      channels: [config.channel],
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
// @TODO: Move anything that calls websocket here to GHOBS lib
const streamInit = (config, twitch) => {
  return new Promise((resolve, reject) => {
    // Set up the initial queue by randomly choosing the configured amount of vods included in shuffling
    state.videoQueue = config.vods.alttp.filter(e => e.includeInShuffle === true).sort(util.randSort).slice(0, config.initialQueueSize);
    console.log(`Initial video queue: ${state.videoQueue.map((c, i) => `[${i+1}] ${c.chatName}`).join(' | ')}`);   

    // Show a gameplay vod
    const showVideo = video => {
      console.log(`Showing video: ${video.chatName}`);

      // play the next video when the previous finishes
      let handleVideoEnd = () => {nextVideo()};

      obs.playVideoInScene(video, config.defaultSceneName, handleVideoEnd)
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

    // Picks the next video in the queue (shuffles if empty)
    // Also handles "commercial breaks" if enabled
    const nextVideo = () => {
      // Show a "commercial break" if it's been long enough since the last one
     /* let secondsSinceLastCommercial = (Date.now() - state.lastCommercialShownAt) / 1000;
      if (config.commercialsEnabled === true && secondsSinceLastCommercial >= config.commercialInterval) {
        state.commercialPlaying = true;

        console.log(`It has been ${secondsSinceLastCommercial} seconds since the last commercial break!`);
        // Random chance for it to be "everybody wow"
        if ((Math.floor(Math.random() * 100) + 1) <= config.auwChance) {
          console.log(`Showing AUW!`);
          auw(() => {
            // show next video in queue once the commercial is done
            state.lastCommercialShownAt = Date.now();
            state.commercialPlaying = false;
            nextVideo();
          });
        } else {
          let commercial = config.vods.memes.sort(util.randSort)[0];
          console.log(`Showing random meme: ${commercial.name}`);

          let handleCommercialFinish = () => {
            // unmute songrequest audio
            twitch.editorChat.say(config.twitch.channel, `!volume ${config.defaultSRVolume}`);

            // update commercial state and show next video in queue
            state.lastCommercialShownAt = Date.now();
            state.commercialPlaying = false;
            nextVideo();
          };

          obs.playVideoInScene(commercial, config.commercialSceneName, handleCommercialFinish)
            .then(res => {
              // mute songrequest audio
              twitch.editorChat.say(config.twitch.channel, `!volume 0`);
            });
        }
          
        return;
      }*/

      // Keep track of recently played videos
      if (state.recentlyPlayed.length === config.recentlyPlayedMemory) {
        state.recentlyPlayed.shift();
      }
      state.recentlyPlayed.push(state.currentVideo.id);

      // If a commercial is playing, wait until it's done
      while (state.commercialPlaying === true) {
        //
      }

      // play the next video in the queue, or pick one at random if the queue is empty
      if (state.videoQueue.length > 0) {
        state.currentVideo = state.videoQueue.shift();
      } else {
        // Random chance for room grind to be played for an amount of time instead of another video be shuffled to
        if ((Math.floor(Math.random() * 100) + 1) <= config.roomGrindChance) {
          console.log(`Room grind selected!`);
          // show room-grind source
          // obs.showRoomGrind(config.roomGrindPlaytime);
          obs.websocket.setSceneItemProperties({"item": "room-grind", "scene-name": config.defaultSceneName, "visible": true})
            .then(res => {
              obs.showActivity("NOW SHOWING: TTAS Room Grind !ttas");
              state.videoTimer = setTimeout(() => {
                // after timeout, hide room-grind and call nextVideo()
                obs.websocket.setSceneItemProperties({"item": "room-grind", "scene-name": config.defaultSceneName, "visible": false});
                nextVideo();
              }, config.roomGrindPlaytime*1000)
            });
            
          return;
        }

        // filter recently played from shuffle
        let freshVods = config.vods.alttp.filter(e => {
          return e.includeInShuffle === true && !state.recentlyPlayed.includes(e.id);
        });
        state.currentVideo = freshVods.sort(util.randSort).slice(0, 1).shift();
      }
      
      showVideo(state.currentVideo);
    };

    // Start queue playback
    state.currentVideo = state.videoQueue.shift();
    showVideo(state.currentVideo);

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

    // Everybody OwenWow
    const auw = (callback) => {
      // find the vod in memes
      let video = config.vods.memes.find(e => e.id === 'auw');
      let handleFinish = () => {
         // hide owen
        obs.websocket.setSceneItemProperties({"item": "owen", "scene-name": config.commercialSceneName, "visible": false});
        // trigger user callback
        if (typeof callback !== 'undefined') callback();
      };

      showCommercial(video, handleFinish)
        .then(videoHasStarted => {
          // show owen
          obs.websocket.setSceneItemProperties({"item": "owen", "scene-name": config.commercialSceneName, "visible": true});              
          // tell chat what's up
          twitch.botChat.say(config.twitch.channel, 'Everybody OwenWow');
        })
        .catch(console.error);
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
            let visibleTerm = (newVisibility ? 'visible' : 'hidden');

            let target = commandParts[1] || false;
            if (!target) {
              twitch.botChat.say(to, `A scene item name is required!`);
              return;
            }

            let sceneItem = {"item": target};

            let sceneOrGroup = commandParts[2] || false;
            if (sceneOrGroup !== false) {
              sceneItem["scene-name"] = sceneOrGroup;
            }

            obs.websocket.getSceneItemProperties(sceneItem)
              .then(data => {
                if (data.visible === newVisibility) {
                  twitch.botChat.say(to, `This scene item is already ${visibleTerm}. DerpHam`);
                } else {
                  sceneItem.visible = newVisibility;
                  obs.websocket.setSceneItemProperties(sceneItem)
                    .then(res => {
                      twitch.botChat.say(to, `${target} is now ${visibleTerm}.`);
                    })
                    .catch(console.error);
                }
              })
              .catch(err => {
                twitch.botChat.say(to, JSON.stringify(err));
              });
       
          // TOGGLE SOURCE VISIBILITY
          } else if (commandNoPrefix === 't') {
            let target = commandParts[1] || false;
            if (!target) {
              twitch.botChat.say(to, `A scene item name is required!`);
              return;
            }

            let sceneItem = {"item": target};

            obs.websocket.getSceneItemProperties(sceneItem)
              .then(data => {
                let newVisibility = !data.visible;
                let visibleTerm = (newVisibility ? 'visible' : 'hidden');

                sceneItem.visible = newVisibility;
                obs.websocket.setSceneItemProperties(sceneItem)
                  .then(res => {
                    twitch.botChat.say(to, `${target} is now ${visibleTerm}.`);
                  })
                  .catch(console.error);
              })
              .catch(err => {
                twitch.botChat.say(to, JSON.stringify(err));
              });

          // SWAP -- Hide one source, show another
          } else if (commandNoPrefix === 'swap') {
            // hide first argument, show second argument
            let targetToHide = commandParts[1] || false;
            let targetToShow = commandParts[2] || false;
            if (targetToHide === false || targetToShow == false) {
              twitch.botChat.say(to, `Format: ${config.twitch.cmdPrefix}swap <item-to-hide> <item-to-show>`);
              return
            }

            obs.websocket.setSceneItemProperties({"item": targetToHide, "visible": false})
              .then(res => {
                obs.websocket.setSceneItemProperties({"item": targetToShow, "visible": true});
              })
              .catch(console.error);
         
          // Black Box "Everybody Wow"
          } else if (commandNoPrefix === 'auw') {
            state.commercialPlaying = true;
            auw(() => {
              state.commercialPlaying = false;
            });
          
          // memes on-demand
          } else if (commandNoPrefix === 'meme') {
            // @TODO: support request by ID
            state.commercialPlaying = true;
            let commercial = config.vods.memes.sort(util.randSort)[0];
            showCommercial(commercial, () => {
              state.commercialPlaying = false;
            });
          
          // SWITCH SCENES
          } else if (commandNoPrefix === 'switch') {

            let target = commandParts[1] || false;
            if (!target) {
              twitch.botChat.say(to, `A scene name is required!`);
              return;
            }

            obs.websocket.getCurrentScene()
              .then(data => {
                if (data.name === target) {
                  twitch.botChat.say(to, `That scene is already active! DerpHam`);
                } else {
                  obs.websocket.setCurrentScene({"scene-name": target})
                    .then(() => {twitch.botChat.say(to, `${target} is now active`)})
                    .catch(console.error);
                }
              })
              .catch(console.error);
          
          // SET ON-SCREEN ACTIVITY
          } else if (commandNoPrefix === 'setactivity') {
            let target = commandParts.slice(1).join(' ');
            if (!target) {
              twitch.botChat.say(to, `Please provide a new activity`);
              return;
            }

            obs.websocket.setTextGDIPlusProperties({"source": config.currentActivitySceneItemName, "scene-name": config.defaultSceneName, "render": true, "text": target})
              .then(res => {
                twitch.botChat.say(to, `Activity updated!`);
                return;
              })
              .catch(console.error);
         
          // REBOOT
          } else if (commandNoPrefix === 'reboot') {
            console.log('Received request from admin to reboot...');
            twitch.botChat.say(to, 'Rebooting...');
            process.exit(0);
          
          // SKIP
          } else if (commandNoPrefix === 'skip') {
            clearTimeout(state.videoTimer);
            obs.websocket.setSceneItemProperties({"item": state.currentVideo.sceneItem, "scene-name": config.defaultSceneName, "visible": false})
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
            videoVoteJob.reschedule("*/15 * * * *");
            twitch.botChat.say(to, `Video Queue Voting will start in 15 minutes!`);
          
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

    resolve(obs);
  });
};

// catches Promise errors
process.on('unhandledRejection', console.error);
