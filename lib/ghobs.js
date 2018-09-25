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
     			this.websocket.onSwitchScenes(data => this.currentScene = data['scene-name']);
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
    	let originalScene = this.currentScene;
    	this.websocket.setCurrentScene({"scene-name": scene})
        .then(res => {
		      // set the file path on the source
		      this.websocket.setSourceSettings({"sourceName": video.sceneItem, "sourceSettings": {"local_file": video.filePath}})
		        // show the video scene item
		        .then(data => this.websocket.setSceneItemProperties({"item": video.sceneItem, "scene-name": scene, "visible": true}))
		        // when the video is over, hide it and trigger the user callback, but resolve promise immediately with the timer
		        .then(data => {
		        	resolve(setTimeout(() => {
		        		this.websocket.setSceneItemProperties({"item": video.sceneItem, "scene-name": scene, "visible": false});
		        		this.websocket.setCurrentScene({"scene-name": originalScene});
		        		callback(data);
		        	}, video.length*1000))
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
};

module.exports = GHOBS;
