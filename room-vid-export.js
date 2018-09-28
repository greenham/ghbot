const rooms = require('./conf/rooms.json');
const util = require('./lib/util');
const fs = require('fs');

populateDatabase();

async function populateDatabase() {
	let database = "'ID','Dungeon','Room'\r\n";
	await util.asyncForEach(rooms, async (room, index) => {
		let entry = `'${room.id}','${room.dungeonName||'?'}','${room.roomName||'?'}'\r\n`;
		database += entry;
		console.log('added entry', entry);
	});

	fs.writeFile('rooms-list.csv', database, 'utf8', () => {console.log('done')});
}
