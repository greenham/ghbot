const schedule = require('node-schedule');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Initialize scheduled events for all guilds
   * @param {Client} client 
   * @param {ConfigManager} configManager 
   */
  async initialize(client, configManager) {
    console.log('Initializing scheduled events...');

    const guildConfigs = configManager.getAllGuildConfigs();
    
    for (const guildConfig of guildConfigs) {
      try {
        const guild = await client.guilds.fetch(guildConfig.id);
        if (!guild) {
          console.error(`Could not find guild ${guildConfig.id}`);
          continue;
        }

        // Get scheduled events from database
        const databaseService = configManager.databaseService;
        if (!databaseService) continue;

        const scheduledEvents = databaseService.getScheduledEvents(guildConfig.id);
        
        if (!scheduledEvents || scheduledEvents.length === 0) {
          continue;
        }

        for (const event of scheduledEvents) {
          await this.scheduleEvent(guild, event, guildConfig);
        }
      } catch (error) {
        console.error(`Error setting up scheduled events for guild ${guildConfig.id}:`, error);
      }
    }
  }

  /**
   * Schedule a single event
   * @param {Guild} guild 
   * @param {Object} event 
   * @param {Object} guildConfig 
   */
  async scheduleEvent(guild, event, guildConfig) {
    try {
      // Validate channel
      let channel = null;
      if (event.channelId) {
        channel = await guild.channels.fetch(event.channelId);
        if (!channel) {
          console.error(`Invalid channel ${event.channelId} for event ${event.id} in guild ${guild.name}`);
          return;
        }
      }

      // Validate role
      let pingRole = null;
      if (event.pingRoleId) {
        pingRole = await guild.roles.fetch(event.pingRoleId);
        if (!pingRole) {
          console.warn(`Invalid role ${event.pingRoleId} for event ${event.id} in guild ${guild.name}`);
        }
      }

      console.log(`Scheduling event ${event.id} for ${guild.name}...`);

      // Create the scheduled job
      const job = schedule.scheduleJob(event.schedule, () => {
        this.executeEvent(channel, event, pingRole);
      });

      if (job) {
        // Store job reference
        const jobKey = `${guild.id}-${event.id}`;
        this.jobs.set(jobKey, job);
        
        console.log(`Event ${event.id} scheduled. Next invocation: ${job.nextInvocation()}`);
      } else {
        console.error(`Failed to schedule event ${event.id} - invalid cron expression: ${event.schedule}`);
      }
    } catch (error) {
      console.error(`Error scheduling event ${event.id}:`, error);
    }
  }

  /**
   * Execute a scheduled event
   * @param {TextChannel} channel 
   * @param {Object} event 
   * @param {Role} pingRole 
   */
  async executeEvent(channel, event, pingRole) {
    try {
      const content = [];

      // Add role ping if configured
      if (pingRole) {
        content.push(pingRole.toString());
      }

      // Add message if configured
      if (event.message) {
        content.push(event.message);
      }

      // Send the message
      if (content.length > 0 && channel) {
        await channel.send(content.join(' '));
        console.log(`Executed scheduled event ${event.id}`);
      }
    } catch (error) {
      console.error(`Error executing scheduled event ${event.id}:`, error);
    }
  }

  /**
   * Cancel a scheduled job
   * @param {string} guildId 
   * @param {string} eventId 
   */
  cancelJob(guildId, eventId) {
    const jobKey = `${guildId}-${eventId}`;
    const job = this.jobs.get(jobKey);
    
    if (job) {
      job.cancel();
      this.jobs.delete(jobKey);
      console.log(`Cancelled scheduled event ${eventId} for guild ${guildId}`);
    }
  }

  /**
   * Cancel all jobs for a guild
   * @param {string} guildId 
   */
  cancelGuildJobs(guildId) {
    for (const [key, job] of this.jobs) {
      if (key.startsWith(`${guildId}-`)) {
        job.cancel();
        this.jobs.delete(key);
      }
    }
    console.log(`Cancelled all scheduled events for guild ${guildId}`);
  }

  /**
   * Cancel all jobs
   */
  cancelAllJobs() {
    for (const job of this.jobs.values()) {
      job.cancel();
    }
    this.jobs.clear();
    console.log('Cancelled all scheduled events');
  }
}

module.exports = new SchedulerService();