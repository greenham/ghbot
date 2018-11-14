var SpotifyWebApi = require('spotify-web-api-node');
let config = require('./config.json');

var scopes = ['streaming', 'app-remote-control', 'user-read-currently-playing', 'user-read-playback-state', 'user-modify-playback-state', 'user-read-recently-played', 'playlist-read-collaborative', 'playlist-modify-private', 'playlist-modify-public', 'playlist-read-private'],
  redirectUri = 'http://forevergrind.fm/spotify',
  clientId = config.spotify.clientId,
  state = 'some-state-of-my-choice';

// Setting credentials can be done in the wrapper's constructor, or using the API object's setters.
var spotifyApi = new SpotifyWebApi({
  redirectUri: redirectUri,
  clientId: clientId
});

// Create the authorization URL
var authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);

// https://accounts.spotify.com:443/authorize?client_id=5fe01282e44241328a84e7c5cc169165&response_type=code&redirect_uri=https://example.com/callback&scope=user-read-private%20user-read-email&state=some-state-of-my-choice
console.log(authorizeURL);