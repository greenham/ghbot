const util = require('./util');

function FGFM(config) {
  // Set up initial state
  this.config = config.config;
  this.obs = config.obs;
  this.state = {
    videoQueue: [],
    recentlyPlayed: [],
    currentVideo: null,
    videoTimer: null,
    lastCommercialShownAt: Date.now(),
    commercialPlaying: false
  };

  // Set up initial queue + start playback
  this.init = () => {
    // Set up the initial queue by randomly choosing the configured amount of vods included in shuffling
    this.state.videoQueue = this.config.vods.alttp.filter(e => e.includeInShuffle === true).sort(util.randSort).slice(0, this.config.initialQueueSize);

    // Start queue playback
    this.state.currentVideo = this.state.videoQueue.shift();
    this.showVideo(this.state.currentVideo);
  };

  // Shows.. a... video
  this.showVideo = video => {
    console.log(`Showing video: ${video.chatName}`);

    this.obs.playVideoInScene(video, this.config.defaultSceneName, this.nextVideo)
      .then(timer => {
        // track timer so we can cancel callback later on if necessary
        this.state.videoTimer = timer;

        // update activity label and show/hide appropriately
        if (video.hasOwnProperty('label') && video.label !== false) {
          this.obs.showActivity(video.label);
        } else {
          this.obs.hideActivity();
        }
      })
      .catch(console.error);
  };

  // Adds a gameplay vod to the queue
  this.addVideo = video => {
    return this.state.videoQueue.push(video);
  };

  // Adds a room to the queue and handles looping setup
  this.addRoomVideo = (room, loop) => {
    let loops = 1;
    if (typeof loop === 'undefined' || loop === true) {
      loops = Math.floor(this.config.roomVidPlaytime / room.videoData.length);
    }
    console.log(`Adding room video for ${room.dungeonName} - ${room.roomName} to the queue (${loops} loops)`);

    let video = {
      filePath: `${this.config.roomVidsBasePath}${room.winPath}`,
      sceneItem: (room.videoData.width === 960) ? "4x3ph" : "16x9ph",
      length: room.videoData.length,
      label: room.roomName,
      chatName: room.roomName,
      loops: loops,
      requestedBy: room.requestedBy
    };

    this.state.videoQueue.push(video);
  };

  // Picks the next video in the queue (shuffles if empty)
  // Also handles "commercial breaks" if enabled
  this.nextVideo = () => {
    // Show a "commercial break" if it's been long enough since the last one
    let secondsSinceLastCommercial = (Date.now() - this.state.lastCommercialShownAt) / 1000;
    if (this.config.commercialsEnabled === true && secondsSinceLastCommercial >= this.config.commercialInterval) {
      console.log(`It has been ${secondsSinceLastCommercial} seconds since the last commercial break!`);
      // Random chance for it to be "everybody wow"
      let memeId = false;
      if ((Math.floor(Math.random() * 100) + 1) <= this.config.auwChance) {
        console.log(`Showing AUW!`);
        memeId = 'auw';
      }

      this.showMeme(memeId)
      .then(() => {
        this.state.lastCommercialShownAt = Date.now();
        this.nextVideo();
      })
      .catch(console.error);
        
      return;
    }

    // Keep track of recently played videos
    if (this.state.recentlyPlayed.length === this.config.recentlyPlayedMemory) {
      this.state.recentlyPlayed.shift();
    }
    this.state.recentlyPlayed.push(this.state.currentVideo.id);

    // If a commercial is playing, wait until it's done to switch
    while (this.state.commercialPlaying === true) {}

    // play the next video in the queue, or pick one at random if the queue is empty
    if (this.state.videoQueue.length > 0) {
      this.state.currentVideo = this.state.videoQueue.shift();
    } else {
      // Random chance for room grind to be played for an amount of time instead of another video be shuffled to
      if ((Math.floor(Math.random() * 100) + 1) <= this.config.roomGrindChance) {
        console.log(`Room grind selected!`);
        // show room-grind source
        this.obs.showRoomGrind(this.config.roomGrindPlaytime, () => {this.nextVideo()})
          .then(timer => {
            this.state.videoTimer = timer;
          })
          .catch(console.error);

        return;
      }

      // Random chance for room videos to be added
      if ((Math.floor(Math.random() * 100) + 1) <= this.config.roomShuffleChance) {
        console.log(`Room vids selected!`);

        this.addRoomVideo(this.config.rooms.sort(util.randSort).slice(0, 1).shift());

        // play the first one
        this.state.currentVideo = this.state.videoQueue.shift();
      } else {
        // filter recently played from shuffle
        let freshVods = this.config.vods.alttp.filter(e => {
          return e.includeInShuffle === true && !this.state.recentlyPlayed.includes(e.id);
        });
        this.state.currentVideo = freshVods.sort(util.randSort).slice(0, 1).shift();
      }
    }
    
    this.showVideo(this.state.currentVideo);
  };

  // "Commercials"
  this.showCommercial = (video, callback) => {
    return new Promise((resolve, reject) => {
      let handleFinish = () => {
        console.log('commercial is finished playing...');
        this.state.commercialPlaying = false;
        if (typeof callback !== 'undefined') callback();
      }

      this.obs.playVideoInScene(video, this.config.commercialSceneName, handleFinish)
        .then(timer => {
          this.state.commercialPlaying = true;
          resolve(timer);
        })
        .catch(reject);
    });
  };

  // Memes-By-Id
  this.showMeme = id => {
    return new Promise((resolve, reject) => {
      // find the vod in memes
      let video = this.config.vods.memes.find(e => e.id === id);
      if (!video) {
        reject(`No meme found matching ID ${id}`);
      }

      let handleFinish = () => {
        if (id === 'auw') {
          this.obs.hide("owen", this.config.commercialSceneName);
        }
        resolve();
      };

      this.showCommercial(video, handleFinish)
        .then(videoHasStarted => {
          // in the case of 'auw', show owen
          if (id === 'auw') {
            this.obs.show("owen", this.config.commercialSceneName);
          }
        })
        .catch(console.error);
    });
  };

  // Skip the current video and play the next
  this.skip = () => {
    clearTimeout(this.state.videoTimer);
    this.obs.hide(this.state.currentVideo.sceneItem, this.config.defaultSceneName).then(this.nextVideo).catch(console.error);
  };

  // Clears.. the... queue
  this.clearQueue = () => {
    this.state.videoQueue = [];
  }
}

module.exports = FGFM;
