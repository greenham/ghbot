// Database-first configuration manager
class ConfigManager {
  constructor() {
    this.databaseService = null; // Will be injected
  }

  /**
   * Inject database service (to avoid circular dependency)
   */
  setDatabaseService(databaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Get bot configuration from database (with environment variable fallbacks)
   */
  getBotConfig() {
    if (!this.databaseService) {
      // Fallback to environment variables if database not available
      return {
        botName: "GHBot",
        debug: false,
        discord: {
          token: process.env.DISCORD_TOKEN,
          adminUserId: process.env.ADMIN_USER_ID,
          activities: ["Playing sounds", "Serving facts"],
          blacklistedUsers: [],
        },
      };
    }

    const dbConfig = this.databaseService.getBotConfiguration();

    return {
      botName: dbConfig.botName || "GHBot",
      debug: dbConfig.debug || false,
      discord: {
        token: dbConfig.token || process.env.DISCORD_TOKEN,
        adminUserId: dbConfig.adminUserId || process.env.ADMIN_USER_ID,
        activities: dbConfig.activities || ["Playing sounds", "Serving facts"],
        blacklistedUsers: dbConfig.blacklistedUsers || [],
      },
    };
  }

  /**
   * Get guild configuration (database only)
   */
  getGuildConfig(guildId) {
    if (!this.databaseService) {
      // Return minimal default config if database not available
      return {
        id: guildId,
        name: "Unknown Guild",
        internalName: "Unknown Guild",
        prefix: "!",
        enableSfx: true,
        sfxVolume: 0.5,
        enableFunFacts: true,
        enableHamFacts: true,
        allowedRolesForRequest: [],
      };
    }

    return this.databaseService.getGuildConfig(guildId);
  }

  /**
   * Get all guild configurations (database only)
   */
  getAllGuildConfigs() {
    if (!this.databaseService) {
      return [];
    }

    return this.databaseService.getAllGuildConfigs();
  }
}

module.exports = new ConfigManager();
