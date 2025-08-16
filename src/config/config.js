const fs = require("fs");
const path = require("path");

// Load config from root directory
const configPath = path.join(__dirname, "..", "..", "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Validate required config fields
function validateConfig(config) {
  if (!config.discord?.token) {
    throw new Error("Discord token is required in config.json");
  }

  if (!config.discord?.guilds || !Array.isArray(config.discord.guilds)) {
    throw new Error("Discord guilds configuration is required");
  }

  // Ensure guilds is an array (supporting both old object format and new array format)
  if (!Array.isArray(config.discord.guilds)) {
    config.discord.guilds = Object.values(config.discord.guilds);
  }

  return config;
}

module.exports = validateConfig(config);
