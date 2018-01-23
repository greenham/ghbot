module.exports = {
  exists: exists,
  get: get
};

const fs = require('fs'),
  path = require('path');

const cmdPrefix = '!';
const commandsFilePath = path.join(__dirname, '..', 'conf', 'ghbot.abcomg');
let commands = parseCommands(commandsFilePath);
fs.watchFile(commandsFilePath, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    commands = require(commandsFilePath);
  }
});

function exists(command)
{
  let matches = commands.filter(obj => { return obj.Command === cmdPrefix+command; });
  if (matches.length > 0) {
    return true;
  } else {
    return false;
  }
}

function get(command)
{
  let matches = commands.filter(obj => { return obj.Command === cmdPrefix+command; });
  if (matches.length > 0) {
    let match = matches[0];
    if (match.Enabled === true) {
      return matches[0].Response;
    } else {
      return undefined;
    }
  } else {
    return undefined;
  }
}

// Read in the array of objects exported from AnkhBot
function parseCommands(filePath)
{
  let data = fs.readFileSync(filePath, 'utf-8');
  let commands = eval(data);  
  return commands;
}