const fs = require('fs');
const path = require('path');
const util = require('./lib/util');
const ffmpeg = require('fluent-ffmpeg');

let roomVidPath = `/var/hypnoadmin/media/videos/ALttP/my-vids/room-vids`;

const getAllFiles = dir =>
  fs.readdirSync(dir).reduce((files, file) => {
    const name = path.join(dir, file);
    const isDirectory = fs.statSync(name).isDirectory();
    return isDirectory ? [...files, ...getAllFiles(name)] : [...files, name];
  }, []);

let roomVidFiles = getAllFiles(roomVidPath);

populateDatabase();

async function populateDatabase() {
	let database = [];
	await util.asyncForEach(roomVidFiles, async (file) => {
		// @TODO: ignore anything that's not an mp4
		let shortPath = file.replace(roomVidPath, '');
		if (!/\.mp4$/.test(shortPath)) {
			return;
		}

		let entry = {
			shortPath: shortPath,
			winPath: shortPath.replace(/\//g, '\\')
		};

  	// chop up the short path and extract metadata
		let matches = shortPath.match(/^\/([0-9]{2})-([a-z]+)\/([0-9]{2})-(.+)\.mp4/);
		if (matches) {
			entry.dungeonId = matches[1];
			entry.dungeonName = matches[2];
			entry.roomId = matches[3];
			entry.roomName = matches[4];
		}

		entry.videoData = await getVideoMetadata(file);
		database.push(entry);
		console.log('added entry', entry);
	});

	fs.writeFile('conf/rooms.json', JSON.stringify(database), 'utf8', () => {console.log('done')});
}

function getVideoMetadata(videoPath) {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(videoPath, (err, metadata) => {
		  // find the video stream
		  let stream = metadata.streams.find(e => e.codec_type === "video");
		  if (!stream) {
		  	resolve(false);
		  }

		  resolve({
		  	width: stream.width,
		  	height: stream.height,
		  	fps: parseInt(stream.r_frame_rate.replace('/1', '')),
		  	length: stream.duration
		  });
		});
	});
}