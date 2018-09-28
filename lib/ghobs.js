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
     			this.websocket.getCurrentScene().then(res => this.currentScene = res.name);
     			this.websocket.onSwitchScenes(data => {
     				//console.log(`New Active Scene: ${data.sceneName}`);
     				this.currentScene = data.sceneName;
     			});
			    resolve();
			  })
			  .catch(reject);

			// Listen for errors from OBS
			this.websocket.on('error', err => {
			  console.error(`OBS websocket error: ${JSON.stringify(err)}`);
			});
		});
	};

	// @TODO: pass any unrecognized commands to the websocket
	
  // Shows a video in the given scene/item and then hides it and switches back to the original scene when finished
  this.playVideoInScene = (video, scene, callback) => {
    return new Promise((resolve, reject) => {
    	let originalScene = this.currentScene || false;
    	//console.log(`Changing scene from ${originalScene} to ${scene}`);
    	this.websocket.setCurrentScene({"scene-name": scene})
        .then(res => {
		      // set the file path on the source
		      //console.log(`Setting file path to: ${video.filePath}`);
		      let sourceSettings = {
		      	"local_file": video.filePath,
		      	"looping": (typeof video.loops !== 'undefined' &&  video.loops > 1)
		      };
		      sourceSettings.loop = sourceSettings.looping;

		      // @TODO loop room vids at a slower speed for a few iterations
		      // @TODO support any sourceSetting?
		      // 
			     /*{ close_when_inactive: true,
			     local_file: 'Y:\\media\\videos\\ALttP\\my-vids\\room-vids\\11-mire\\38-wizzpot-rta-hook-610.mp4',
			     loop: true,
			     looping: false,
			     restart_on_activate: false,
			     speed_percent: 100 }*/

		      //this.websocket.getSourceSettings({"sourceName": video.sceneItem}).then(console.log);

		      this.websocket.setSourceSettings({"sourceName": video.sceneItem, "sourceSettings": sourceSettings})
		        // show the video scene item
		        .then(() => this.websocket.setSceneItemProperties({"item": video.sceneItem, "scene-name": scene, "visible": true}))
		        // when the video is over, hide it and trigger the user callback, but resolve promise immediately with the timer
		        .then(data => {
		        	// adjust timeout length to allow the requested number of loops to complete
	        		if (sourceSettings.loop === true) {
	        			video.length *= video.loops;
	        			console.log(`Video is set to loop, adjusted length to ${video.length}`);
	        		}

		        	resolve(setTimeout(() => {
		        		//console.log(`Hiding ${video.sceneItem}`);
		        		this.websocket.setSceneItemProperties({"item": video.sceneItem, "scene-name": scene, "visible": false});
		        		if (originalScene) {
			        		//console.log(`Switching scene back to ${originalScene}`);
			        		this.websocket.setCurrentScene({"scene-name": originalScene});
		        		}
		        		if (typeof callback !== 'undefined') {
			        		//console.log('Triggering user callback');
			        		callback(data);
			        	}
		        	}, parseInt(video.length*1000)))
		        });
        })
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
