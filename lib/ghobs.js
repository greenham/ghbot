const OBSWebSocket = require('obs-websocket-js');

function GHOBS(config) {
	this.config = config;
	this.websocket = new OBSWebSocket();

	this.init = () => {
		return new Promise((resolve, reject) => {
			console.log(`Connecting to OBS Websocket...`);
			this.websocket.connect({ address: this.config.obs.websocket.address, password: this.config.obs.websocket.password })
			  .then(() => {
			    console.log(`Success! We're connected to OBS!`);
     			this.websocket.getCurrentScene().then(currentScene => this.currentScene = currentScene.name);
     			this.websocket.onSwitchScenes(newScene => this.currentScene = newScene.sceneName);
			    resolve();
			  })
			  .catch(reject);

			// Listen for errors from OBS
			// @TODO: Handle socket disconnect gracefully
			/** { status: 'error',
  			description: 'There is no Socket connection available.',
  			code: 'NOT_CONNECTED',
  			error: 'There is no Socket connection available.' }*/
			this.websocket.on('error', err => {
			  console.error(`OBS websocket error: ${JSON.stringify(err)}`);
			});
		});
	};

	this.startStream = () => {
		return this.websocket.startStreaming();
	};

	this.stopStream = () => {
		return this.websocket.stopStreaming();
	};

	this.setVolume = (source, volume) => {
		return this.websocket.setVolume({source: source, volume: volume});
	}

	this.getVolume = (source) => {
		return new Promise((resolve, reject) => {
			this.websocket.getVolume({source: source})
			.then(res => {
				resolve(res.volume);
			})
			.catch(reject);
		});
	}

	// Plays a video in the current scene and hides when finished
	this.playVideo = (video, callback) => {
		return new Promise((resolve, reject) => {
			// @TODO Validation of video
		
			// set the file path on the source
	    let sourceSettings = {
	    	local_file: video.filePath,
	    	looping: (typeof video.loops !== 'undefined' &&  video.loops > 1)
	    };
	    sourceSettings.loop = sourceSettings.looping;

	    this.websocket.setSourceSettings({"sourceName": video.sceneItem, "sourceSettings": sourceSettings})
	      // show the video scene item
	      .then(() => this.websocket.setSceneItemProperties({"item": video.sceneItem, "visible": true}))
	      // when the video is over, hide it and trigger the user callback, but resolve promise immediately with the timer
	      .then(() => {
	      	// if this video is being looped, adjust timeout length to allow the requested number of loops to complete
	    		if (sourceSettings.loop === true) {
	    			video.length *= video.loops;
	    		}

	    		// resolve Promise with a timer of when the video will finish playback
	    		// trigger user callback when the video finishes
	    		let timer = setTimeout(() => {
	      		this.websocket.setSceneItemProperties({"item": video.sceneItem, "visible": false});
	      		if (typeof callback !== 'undefined') {
	        		callback();
	        	}
	      	}, parseInt(video.length*1000));

	      	resolve(timer);
	      })
	      .catch(reject);
		});
	}
	
  // Shows a video in the given scene/item and then hides it and switches back to the original scene when finished
  this.playVideoInScene = (video, scene, callback) => {
    return new Promise((resolve, reject) => {
    	video.scene = scene;
    	let originalScene = this.currentScene || false;
    	let handleVideoEnd = () => {
    		if (originalScene !== false) {
      		this.websocket.setCurrentScene({"scene-name": originalScene});
    		}
    		if (typeof callback !== 'undefined') {
      		callback();
      	}
    	};

    	this.websocket.setCurrentScene({"scene-name": scene})
        .then(() => this.playVideo(video, handleVideoEnd))
        .then(timer => { resolve(timer) })
        .catch(reject);
    });
  };

  this.showActivity = (newActivity)  => {
  	let update = {
  		"source": this.config.currentActivitySceneItemName,
  		"scene-name": this.config.defaultSceneName,
  		"render": true
  	};

  	if (typeof newActivity !== 'undefined' && newActivity.length > 0) {
  		update.text = newActivity;
  	}

  	return this.websocket.setTextGDIPlusProperties(update);
  };

  this.hideActivity = () => {
  	return this.websocket.setSceneItemProperties({"item": this.config.currentActivitySceneItemName, "scene-name": this.config.defaultSceneName, "visible": false});
  };

  this.showRoomGrind = (playTime, callback) => {
  	return new Promise((resolve, reject) => {
	  	this.websocket.setSceneItemProperties({"item": "room-grind", "scene-name": this.config.defaultSceneName, "visible": true})
	      .then(res => {
	        this.showActivity("NOW SHOWING: TTAS Room Grind !ttas");
	        resolve(setTimeout(() => {
	          // after timeout, hide room-grind and call user callback
	          this.websocket.setSceneItemProperties({"item": "room-grind", "scene-name": this.config.defaultSceneName, "visible": false});
	          if (typeof callback !== 'undefined') callback();	          
	        }, playTime*1000));
	      })
	      .catch(reject);
  	});
  };

  this.setVisible = (item, scene, visible) => {
  	return this.websocket.setSceneItemProperties({"item": item, "scene-name": scene, "visible": visible});
  };

  this.toggleVisible = (item) => {
  	return new Promise((resolve, reject) => {
	  	this.websocket.getSceneItemProperties({"item": item})
	      .then(data => {
	        let newVisibility = !data.visible;
	        this.websocket.setSceneItemProperties({"item": item, "visible": newVisibility}).then(resolve);
	      })
	      .catch(reject);
  	});
  }

  this.show = (item, scene) => {
  	return this.setVisible(item, scene, true);
  };

  this.hide = (item, scene) => {
  	return this.setVisible(item, scene, false);
  };

  this.switchToScene = (scene) => {
  	return new Promise((resolve, reject) => {
	  	if (this.currentScene === scene) {
	  		resolve(true);
	  	}

			this.websocket.setCurrentScene({"scene-name": scene}).then(resolve).catch(reject);
  	});
  };
};

module.exports = GHOBS;
