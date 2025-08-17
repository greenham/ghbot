const Database = require("better-sqlite3");
const path = require("path");

class DatabaseService {
  constructor() {
    // Store database in data directory
    const dbPath = path.join(__dirname, "..", "..", "data", "ghbot.db");
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent access
    this.db.pragma("journal_mode = WAL");

    this.initializeTables();
  }

  /**
   * Initialize database tables
   */
  initializeTables() {
    // Guild configurations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guilds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        internal_name TEXT,
        prefix TEXT DEFAULT '!',
        enable_sfx BOOLEAN DEFAULT true,
        sfx_volume REAL DEFAULT 0.5,
        enable_fun_facts BOOLEAN DEFAULT true,
        enable_ham_facts BOOLEAN DEFAULT true,
        allowed_roles_for_request TEXT DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        removed_at DATETIME
      )
    `);

    // Scheduled events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        schedule TEXT NOT NULL,
        channel_id TEXT,
        message TEXT,
        ping_role_id TEXT,
        enabled BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (guild_id) REFERENCES guilds (id) ON DELETE CASCADE,
        UNIQUE(guild_id, event_id)
      )
    `);

    // Bot configuration table (for global settings)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bot_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default bot config if not exists
    this.db.exec(`
      INSERT OR IGNORE INTO bot_config (key, value) VALUES 
      ('bot_name', 'GHBot'),
      ('debug', 'false'),
      ('admin_user_id', ''),
      ('activities', '["Chardee MacDennis", "The Nightman Cometh", "Charlie Work"]'),
      ('blacklisted_users', '[]')
    `);

    console.log("Database tables initialized");

    // Prepare statements after tables are created
    this.prepareStatements();

    // Run migrations after statements are prepared
    this.runMigrations();
  }

  /**
   * Run database migrations
   */
  runMigrations() {
    // Check if we need to seed from config file
    const guildCount = this.db
      .prepare("SELECT COUNT(*) as count FROM guilds")
      .get().count;

    if (guildCount === 0) {
      console.log(
        "No guilds found in database, checking for config file to seed..."
      );
      this.seedFromConfigFile();
    }
  }

  /**
   * Seed database with guilds from config file
   */
  seedFromConfigFile() {
    try {
      const fs = require("fs");
      const path = require("path");

      const configPath = path.join(__dirname, "..", "..", "config.json");

      if (!fs.existsSync(configPath)) {
        console.log("No config.json file found, skipping seed");
        return;
      }

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      if (!config.discord?.guilds) {
        console.log("No guilds found in config.json, skipping seed");
        return;
      }

      // Expect guilds to be an array
      const guilds = config.discord.guilds;

      if (!Array.isArray(guilds)) {
        console.log("Config guilds must be an array format, skipping seed");
        return;
      }

      let seededCount = 0;

      for (const guild of guilds) {
        if (!guild.id) {
          console.warn("Skipping guild with missing ID:", guild);
          continue;
        }

        // Convert config format to database format
        const guildConfig = {
          id: guild.id,
          name: guild.internalName || guild.name || "Unknown Guild",
          internalName: guild.internalName || guild.name || "Unknown Guild",
          prefix: guild.prefix || "!",
          enableSfx: guild.enableSfx !== false,
          sfxVolume: guild.sfxVolume || 0.5,
          enableFunFacts: guild.enableFunFacts !== false,
          enableHamFacts: guild.enableHamFacts !== false,
          allowedRolesForRequest: Array.isArray(guild.allowedRolesForRequest)
            ? guild.allowedRolesForRequest.filter(
                (id) => id && id.trim() !== ""
              )
            : [],
        };

        // Insert guild configuration
        this.upsertGuildConfig(guildConfig);

        // Insert scheduled events if they exist
        if (guild.scheduledEvents && Array.isArray(guild.scheduledEvents)) {
          for (const event of guild.scheduledEvents) {
            if (event.id && event.schedule) {
              try {
                console.log(
                  `Importing scheduled event: ${event.id} for guild ${guild.id}`
                );
                this.addScheduledEvent(guild.id, event);
              } catch (error) {
                console.warn(
                  `Skipping scheduled event ${event.id} for guild ${guild.id}:`,
                  error.message
                );
                console.warn("Event object:", JSON.stringify(event, null, 2));
              }
            }
          }
        }

        seededCount++;
      }

      console.log(
        `✅ Successfully seeded database with ${seededCount} guild(s) from config.json`
      );

      // Update bot configuration in database from file config
      if (config.botName) {
        this.setBotConfig("bot_name", config.botName);
      }
      if (config.debug !== undefined) {
        this.setBotConfig("debug", config.debug.toString());
      }
      if (config.discord?.adminUserId) {
        this.setBotConfig("admin_user_id", config.discord.adminUserId);
      }
      if (
        config.discord?.activities &&
        Array.isArray(config.discord.activities)
      ) {
        this.setBotConfig(
          "activities",
          JSON.stringify(config.discord.activities)
        );
      }
      if (
        config.discord?.blacklistedUsers &&
        Array.isArray(config.discord.blacklistedUsers)
      ) {
        this.setBotConfig(
          "blacklisted_users",
          JSON.stringify(config.discord.blacklistedUsers)
        );
      }

      console.log("✅ Bot configuration updated from config.json");
    } catch (error) {
      console.error("Error seeding database from config file:", error);
    }
  }

  /**
   * Prepare SQL statements for better performance
   */
  prepareStatements() {
    this.statements = {
      // Guild operations
      getGuild: this.db.prepare(
        "SELECT * FROM guilds WHERE id = ? AND is_active = true"
      ),
      getAllGuilds: this.db.prepare(
        "SELECT * FROM guilds WHERE is_active = true"
      ),
      insertGuild: this.db.prepare(`
        INSERT OR REPLACE INTO guilds 
        (id, name, internal_name, prefix, enable_sfx, sfx_volume, 
         enable_fun_facts, enable_ham_facts, allowed_roles_for_request)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateGuild: this.db.prepare(`
        UPDATE guilds SET 
          name = ?, internal_name = ?, prefix = ?, enable_sfx = ?, 
          sfx_volume = ?, enable_fun_facts = ?, 
          enable_ham_facts = ?, allowed_roles_for_request = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND is_active = true
      `),
      softDeleteGuild: this.db.prepare(`
        UPDATE guilds SET is_active = false, removed_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `),
      reactivateGuild: this.db.prepare(`
        UPDATE guilds SET is_active = true, removed_at = NULL, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `),
      hardDeleteGuild: this.db.prepare("DELETE FROM guilds WHERE id = ?"),

      // Scheduled events
      getScheduledEvents: this.db.prepare(
        "SELECT * FROM scheduled_events WHERE guild_id = ? AND enabled = true"
      ),
      insertScheduledEvent: this.db.prepare(`
        INSERT OR REPLACE INTO scheduled_events 
        (guild_id, event_id, schedule, channel_id, message, ping_role_id, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      deleteScheduledEvent: this.db.prepare(
        "DELETE FROM scheduled_events WHERE guild_id = ? AND event_id = ?"
      ),

      // Bot config
      getBotConfig: this.db.prepare(
        "SELECT value FROM bot_config WHERE key = ?"
      ),
      setBotConfig: this.db.prepare(`
        INSERT OR REPLACE INTO bot_config (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `),
    };
  }

  /**
   * Get guild configuration
   * @param {string} guildId
   * @returns {Object|null}
   */
  getGuildConfig(guildId) {
    const guild = this.statements.getGuild.get(guildId);
    if (!guild) return null;

    return {
      id: guild.id,
      name: guild.name,
      internalName: guild.internal_name,
      prefix: guild.prefix,
      enableSfx: Boolean(guild.enable_sfx),
      sfxVolume: guild.sfx_volume,
      enableFunFacts: Boolean(guild.enable_fun_facts),
      enableHamFacts: Boolean(guild.enable_ham_facts),
      allowedRolesForRequest: this.parseRoleIds(
        guild.allowed_roles_for_request
      ),
    };
  }

  /**
   * Get all guild configurations
   * @returns {Array}
   */
  getAllGuildConfigs() {
    const guilds = this.statements.getAllGuilds.all();
    return guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      internalName: guild.internal_name,
      prefix: guild.prefix,
      enableSfx: Boolean(guild.enable_sfx),
      sfxVolume: guild.sfx_volume,
      enableFunFacts: Boolean(guild.enable_fun_facts),
      enableHamFacts: Boolean(guild.enable_ham_facts),
      allowedRolesForRequest: guild.allowed_roles_for_request,
    }));
  }

  /**
   * Add or update guild configuration
   * @param {Object} guildConfig
   * @param {boolean} isReactivation - Whether this is reactivating an existing guild
   */
  upsertGuildConfig(guildConfig, isReactivation = false) {
    if (isReactivation) {
      // Check if guild exists but is inactive
      const existingGuild = this.db
        .prepare("SELECT * FROM guilds WHERE id = ?")
        .get(guildConfig.id);
      if (existingGuild && !existingGuild.is_active) {
        // Reactivate existing guild and update its info
        this.statements.reactivateGuild.run(guildConfig.id);
        // Update the guild info
        this.statements.updateGuild.run(
          guildConfig.name,
          guildConfig.internalName || guildConfig.name,
          existingGuild.prefix, // Keep existing prefix
          existingGuild.enable_sfx ? 1 : 0, // Keep existing settings
          existingGuild.allowed_sfx_channels,
          existingGuild.sfx_volume,
          existingGuild.enable_fun_facts ? 1 : 0,
          existingGuild.enable_ham_facts ? 1 : 0,
          existingGuild.allowed_roles_for_request,
          guildConfig.id
        );
        console.log(
          `Guild reactivated with existing configuration: ${guildConfig.name} (${guildConfig.id})`
        );
        return;
      }
    }

    // Insert new guild or replace completely
    this.statements.insertGuild.run(
      guildConfig.id,
      guildConfig.name,
      guildConfig.internalName || guildConfig.name,
      guildConfig.prefix || "!",
      guildConfig.enableSfx !== false ? 1 : 0,
      guildConfig.sfxVolume || 0.5,
      guildConfig.enableFunFacts !== false ? 1 : 0,
      guildConfig.enableHamFacts !== false ? 1 : 0,
      JSON.stringify(guildConfig.allowedRolesForRequest || [])
    );

    console.log(
      `Guild configuration saved: ${guildConfig.name} (${guildConfig.id})`
    );
  }

  /**
   * Soft delete guild configuration (can be restored)
   * @param {string} guildId
   */
  softDeleteGuildConfig(guildId) {
    const result = this.statements.softDeleteGuild.run(guildId);
    if (result.changes > 0) {
      console.log(`Guild configuration soft-deleted: ${guildId}`);
    }
    return result.changes > 0;
  }

  /**
   * Hard delete guild configuration (permanent)
   * @param {string} guildId
   */
  hardDeleteGuildConfig(guildId) {
    const result = this.statements.hardDeleteGuild.run(guildId);
    if (result.changes > 0) {
      console.log(`Guild configuration permanently deleted: ${guildId}`);
    }
    return result.changes > 0;
  }

  /**
   * Check if guild exists (including inactive)
   * @param {string} guildId
   * @returns {Object|null}
   */
  getGuildConfigIncludingInactive(guildId) {
    const guild = this.db
      .prepare("SELECT * FROM guilds WHERE id = ?")
      .get(guildId);
    if (!guild) return null;

    return {
      id: guild.id,
      name: guild.name,
      internalName: guild.internal_name,
      prefix: guild.prefix,
      enableSfx: Boolean(guild.enable_sfx),
      sfxVolume: guild.sfx_volume,
      enableFunFacts: Boolean(guild.enable_fun_facts),
      enableHamFacts: Boolean(guild.enable_ham_facts),
      allowedRolesForRequest: guild.allowed_roles_for_request,
      isActive: Boolean(guild.is_active),
      removedAt: guild.removed_at,
    };
  }

  /**
   * Get scheduled events for a guild
   * @param {string} guildId
   * @returns {Array}
   */
  getScheduledEvents(guildId) {
    const events = this.statements.getScheduledEvents.all(guildId);

    // Parse schedule strings back to objects/strings for node-schedule
    return events.map((event) => ({
      ...event,
      schedule: this.parseSchedule(event.schedule),
    }));
  }

  /**
   * Parse schedule string back to object or cron string
   * @param {string} scheduleString
   * @returns {Object|string}
   */
  parseSchedule(scheduleString) {
    try {
      // Try to parse as JSON (object format)
      return JSON.parse(scheduleString);
    } catch {
      // If it fails, it's probably a cron string
      return scheduleString;
    }
  }

  /**
   * Add scheduled event
   * @param {string} guildId
   * @param {Object} event
   */
  addScheduledEvent(guildId, event) {
    // Store schedule as JSON string to preserve object format and timezone
    const scheduleString =
      typeof event.schedule === "string"
        ? event.schedule
        : JSON.stringify(event.schedule);

    this.statements.insertScheduledEvent.run(
      guildId,
      event.id,
      scheduleString,
      event.channelId || null,
      event.message || null,
      event.pingRoleId || null,
      event.enabled !== false ? 1 : 0
    );
  }

  /**
   * Remove scheduled event
   * @param {string} guildId
   * @param {string} eventId
   */
  removeScheduledEvent(guildId, eventId) {
    this.statements.deleteScheduledEvent.run(guildId, eventId);
  }

  /**
   * Get bot configuration value
   * @param {string} key
   * @returns {string|null}
   */
  getBotConfig(key) {
    const result = this.statements.getBotConfig.get(key);
    return result ? result.value : null;
  }

  /**
   * Set bot configuration value
   * @param {string} key
   * @param {string} value
   */
  setBotConfig(key, value) {
    this.statements.setBotConfig.run(key, value);
  }

  /**
   * Get parsed bot configuration
   * @returns {Object}
   */
  getBotConfiguration() {
    const botName = this.getBotConfig("bot_name") || "GHBot";
    const debug = this.getBotConfig("debug") === "true";
    const adminUserId = this.getBotConfig("admin_user_id") || "";
    const activities = JSON.parse(this.getBotConfig("activities") || "[]");
    const blacklistedUsers = JSON.parse(
      this.getBotConfig("blacklisted_users") || "[]"
    );

    return {
      botName,
      debug,
      adminUserId,
      activities,
      blacklistedUsers,
    };
  }

  /**
   * Parse role IDs from JSON string
   * @param {string} roleIdsJson
   * @returns {Array<string>}
   */
  parseRoleIds(roleIdsJson) {
    try {
      return JSON.parse(roleIdsJson || "[]");
    } catch {
      return [];
    }
  }

  /**
   * Get allowed role IDs for a guild
   * @param {string} guildId
   * @returns {Array<string>}
   */
  getAllowedRoleIds(guildId) {
    const guild = this.statements.getGuild.get(guildId);
    return guild ? this.parseRoleIds(guild.allowed_roles_for_request) : [];
  }

  /**
   * Add a role ID to the allowed list
   * @param {string} guildId
   * @param {string} roleId
   */
  addAllowedRole(guildId, roleId) {
    const currentRoles = this.getAllowedRoleIds(guildId);
    if (!currentRoles.includes(roleId)) {
      currentRoles.push(roleId);
      this.updateAllowedRoleIds(guildId, currentRoles);
    }
  }

  /**
   * Remove a role ID from the allowed list
   * @param {string} guildId
   * @param {string} roleId
   */
  removeAllowedRole(guildId, roleId) {
    const currentRoles = this.getAllowedRoleIds(guildId);
    const updatedRoles = currentRoles.filter((id) => id !== roleId);
    if (updatedRoles.length !== currentRoles.length) {
      this.updateAllowedRoleIds(guildId, updatedRoles);
    }
  }

  /**
   * Update allowed role IDs for a guild
   * @param {string} guildId
   * @param {Array<string>} roleIds
   */
  updateAllowedRoleIds(guildId, roleIds) {
    const updateStmt = this.db.prepare(
      "UPDATE guilds SET allowed_roles_for_request = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = true"
    );
    updateStmt.run(JSON.stringify(roleIds), guildId);
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = new DatabaseService();
