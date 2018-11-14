var SpotifyWebApi = require('spotify-web-api-node');

function Spotify(config) {
  // Set up initial state
  this.config = config;

  this.credentials = {
    clientId: this.config.clientId,
    clientSecret: this.config.clientSecret,
    redirectUri: this.config.redirectUri
  };

  const spotifyApi = new SpotifyWebApi(this.credentials);

  // The code that's returned as a query parameter to the redirect URI
  const code = this.config.userCode;

  this.init = () => {
    return new Promise((resolve, reject) => {
      // Retrieve an access token and a refresh token
      spotifyApi.authorizationCodeGrant(code).then(
        function(data) {
          console.log('The token expires in ' + data.body['expires_in']);
          console.log('The access token is ' + data.body['access_token']);
          console.log('The refresh token is ' + data.body['refresh_token']);

          // Set the access token on the API object to use it in later calls
          spotifyApi.setAccessToken(data.body['access_token']);
          spotifyApi.setRefreshToken(data.body['refresh_token']);

          // clientId, clientSecret and refreshToken has been set on the api object previous to this call.
          setInterval(() => {
            spotifyApi.refreshAccessToken().then(
              function(data) {
                console.log('The access token has been refreshed!');

                // Save the access token so that it's used in future calls
                spotifyApi.setAccessToken(data.body['access_token']);
              },
              function(err) {
                console.log('Could not refresh access token', err);
              }
            );
          }, data.body['expires_in']*1000);

          resolve();
        },
        function(err) {
          console.log('Something went wrong!', JSON.stringify(err));
          reject(err);
        }
      );
    });
  };

  this.getMe = () => {
    spotifyApi.getMe()
    .then(function(data) {
      console.log('Some information about the authenticated user', data.body);
    }, function(err) {
      console.log('Something went wrong!', err);
    });
  };

  this.getPlaybackState = () => {
    spotifyApi.getMyCurrentPlaybackState({
    })
    .then(function(data) {
      // Output items
      console.log("Now Playing: ",data.body);
    }, function(err) {
      console.log('Something went wrong!', err);
    });
  }
}

module.exports = Spotify;