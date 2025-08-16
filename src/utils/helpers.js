/**
 * Pick a random element from an array
 * @param {Array} arr 
 * @returns {*} Random element from the array
 */
function randElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Random sort function
 * @returns {number}
 */
function randSort() {
  return 0.5 - Math.random();
}

/**
 * Split a string into chunks of specified size
 * @param {string} str 
 * @param {number} size 
 * @returns {string[]}
 */
function chunkSubstr(str, size) {
  const numChunks = Math.ceil(str.length / size);
  const chunks = new Array(numChunks);

  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size);
  }

  return chunks;
}

/**
 * Async forEach implementation
 * @param {Array} array 
 * @param {Function} callback 
 */
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

/**
 * Converts seconds to human-readable time
 * @param {number} seconds 
 * @returns {string} HH:MM:SS format
 */
function toHHMMSS(seconds) {
  const sec_num = parseInt(seconds, 10);
  let hours = Math.floor(sec_num / 3600);
  let minutes = Math.floor((sec_num - hours * 3600) / 60);
  let secs = sec_num - hours * 3600 - minutes * 60;

  if (hours < 10) hours = "0" + hours;
  if (minutes < 10) minutes = "0" + minutes;
  if (secs < 10) secs = "0" + secs;
  
  return hours + ":" + minutes + ":" + secs;
}

module.exports = {
  randElement,
  randSort,
  chunkSubstr,
  asyncForEach,
  toHHMMSS
};