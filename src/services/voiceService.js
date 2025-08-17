const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState,
  getVoiceConnection,
} = require("@discordjs/voice");
const { ChannelType } = require("discord.js");

// Try to use ffmpeg-static as fallback if system ffmpeg is not available
try {
  const ffmpegPath = require("ffmpeg-static");
  if (ffmpegPath && !process.env.FFMPEG_PATH) {
    process.env.FFMPEG_PATH = ffmpegPath;
  }
} catch (error) {
  // ffmpeg-static not available, rely on system ffmpeg
}

class VoiceService {
  constructor() {
    this.connections = new Map();
    this.players = new Map();
  }

  /**
   * Join a voice channel
   * @param {VoiceChannel} channel
   * @returns {VoiceConnection}
   */
  async join(channel) {
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      throw new Error("Invalid voice channel");
    }

    // Check if already connected
    let connection = getVoiceConnection(channel.guild.id);

    if (!connection) {
      connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });

      // Wait for connection to be ready
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      } catch (error) {
        connection.destroy();
        throw error;
      }

      // Store connection
      this.connections.set(channel.guild.id, connection);

      // Handle disconnection
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          // Try to reconnect
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch (error) {
          // Seems to be a real disconnect, destroy the connection
          connection.destroy();
          this.connections.delete(channel.guild.id);
          this.players.delete(channel.guild.id);
        }
      });
    }

    return connection;
  }

  /**
   * Leave a voice channel
   * @param {string} guildId
   */
  leave(guildId) {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.destroy();
      this.connections.delete(guildId);
      this.players.delete(guildId);
    }
  }

  /**
   * Play an audio file
   * @param {string} guildId
   * @param {string} filePath
   * @param {Object} options
   * @returns {AudioPlayer}
   */
  async play(guildId, filePath, options = {}) {
    const connection = this.connections.get(guildId);
    if (!connection) {
      throw new Error("Not connected to voice channel");
    }

    // Create or get player for this guild
    let player = this.players.get(guildId);
    if (!player) {
      player = createAudioPlayer();
      this.players.set(guildId, player);
    }

    // Create audio resource with options
    const resource = createAudioResource(filePath, {
      inlineVolume: options.volume !== undefined,
    });

    if (options.volume !== undefined && resource.volume) {
      resource.volume.setVolume(options.volume);
    }

    // Subscribe the connection to the player
    connection.subscribe(player);

    // Play the resource
    player.play(resource);

    // Return a promise that resolves when playback finishes
    return new Promise((resolve, reject) => {
      player.once(AudioPlayerStatus.Idle, () => {
        resolve();
      });

      player.once("error", (error) => {
        console.error("Player error:", error);
        reject(error);
      });
    });
  }

  /**
   * Stop playing audio
   * @param {string} guildId
   */
  stop(guildId) {
    const player = this.players.get(guildId);
    if (player) {
      player.stop();
    }
  }

  /**
   * Check if connected to a voice channel
   * @param {string} guildId
   * @returns {boolean}
   */
  isConnected(guildId) {
    return this.connections.has(guildId);
  }

  /**
   * Get the current voice connection
   * @param {string} guildId
   * @returns {VoiceConnection|undefined}
   */
  getConnection(guildId) {
    return this.connections.get(guildId);
  }
}

module.exports = new VoiceService();
