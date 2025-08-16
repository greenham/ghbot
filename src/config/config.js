const fs = require("fs");
const path = require("path");

// Dynamic config that combines file-based config with database
class ConfigManager {
  constructor() {
    this.fileConfig = this.loadFileConfig();
    this.databaseService = null; // Will be injected
  }

  /**
   * Load static configuration from file
   */
  loadFileConfig() {
    const configPath = path.join(__dirname, "..", "..", "config.json");
    
    if (!fs.existsSync(configPath)) {
      console.warn("config.json not found, using environment variables only");
      return {
        discord: {
          token: process.env.DISCORD_TOKEN,
          adminUserId: process.env.ADMIN_USER_ID,
        }
      };
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    
    // Validate required fields
    if (!config.discord?.token && !process.env.DISCORD_TOKEN) {
      throw new Error("Discord token is required in config.json or DISCORD_TOKEN environment variable");
    }

    return config;
  }

  /**
   * Inject database service (to avoid circular dependency)
   */
  setDatabaseService(databaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Get bot configuration (combines file and database)
   */
  getBotConfig() {
    const fileConfig = this.fileConfig;
    const dbConfig = this.databaseService ? this.databaseService.getBotConfiguration() : {};

    return {
      // Use file config as fallback, database as primary
      botName: dbConfig.botName || fileConfig.botName || 'GHBot',
      debug: dbConfig.debug !== undefined ? dbConfig.debug : (fileConfig.debug || false),
      discord: {
        token: fileConfig.discord?.token || process.env.DISCORD_TOKEN,
        adminUserId: dbConfig.adminUserId || fileConfig.discord?.adminUserId || process.env.ADMIN_USER_ID,
        activities: dbConfig.activities || fileConfig.discord?.activities || ['Playing sounds', 'Serving facts'],
        blacklistedUsers: dbConfig.blacklistedUsers || fileConfig.discord?.blacklistedUsers || [],
        master: fileConfig.discord?.master !== false, // Default to true
      }
    };
  }

  /**
   * Get guild configuration (from database primarily, file as fallback)
   */
  getGuildConfig(guildId) {
    if (this.databaseService) {
      const dbConfig = this.databaseService.getGuildConfig(guildId);
      if (dbConfig) {
        return dbConfig;
      }
    }

    // Fallback to file config for backward compatibility
    if (this.fileConfig.discord?.guilds) {
      const guilds = Array.isArray(this.fileConfig.discord.guilds) 
        ? this.fileConfig.discord.guilds 
        : Object.values(this.fileConfig.discord.guilds);
      
      return guilds.find(g => g.id === guildId);
    }

    // Return default config for new guilds
    return {
      id: guildId,
      name: 'Unknown Guild',
      internalName: 'Unknown Guild',
      prefix: '!',
      enableSfx: true,
      allowedSfxChannels: null,
      sfxVolume: 0.5,
      enableFunFacts: true,
      enableHamFacts: true,
      allowedRolesForRequest: null,
    };
  }

  /**
   * Get all guild configurations
   */
  getAllGuildConfigs() {
    if (this.databaseService) {
      return this.databaseService.getAllGuildConfigs();
    }

    // Fallback to file config
    if (this.fileConfig.discord?.guilds) {
      const guilds = Array.isArray(this.fileConfig.discord.guilds) 
        ? this.fileConfig.discord.guilds 
        : Object.values(this.fileConfig.discord.guilds);
      
      return guilds;
    }

    return [];
  }
}

module.exports = new ConfigManager();
