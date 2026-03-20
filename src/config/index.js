/**
 * Configuration loader
 * Centralizes all environment variables with validation and defaults
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..');

dotenv.config({ path: resolve(projectRoot, '.env') });

/**
 * Validate required environment variables
 */
function validateEnv() {
  const required = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'YOUTUBE_API_KEY',
    'TWITCH_CLIENT_ID',
    'TWITCH_CLIENT_SECRET',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n📝 Copy .env.example to .env and fill in your API keys.');
    process.exit(1);
  }
}

validateEnv();

/**
 * Configuration object with all settings
 */
export const config = {
  // Discord
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    devGuildId: process.env.DEV_GUILD_ID,

    // Bot customization
    botName: process.env.BOT_NAME || 'Veronica',
    status: process.env.BOT_STATUS || 'online',
    activityType: process.env.BOT_ACTIVITY_TYPE || 'WATCHING',
    activityText: process.env.BOT_ACTIVITY_TEXT || 'live streams',

    // Admin IDs (users who can use management commands)
    adminIds: process.env.BOT_ADMIN_IDS
      ? process.env.BOT_ADMIN_IDS.split(',').map(id => id.trim()).filter(Boolean)
      : [],
  },

  // YouTube
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    pollInterval: parseInt(process.env.YOUTUBE_POLL_INTERVAL || '120000', 10),
    maxRequestsPerMinute: parseInt(process.env.YOUTUBE_MAX_REQUESTS_PER_MINUTE || '30', 10),
  },

  // Twitch
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    pollInterval: parseInt(process.env.TWITCH_POLL_INTERVAL || '60000', 10),
    maxRequestsPerMinute: parseInt(process.env.TWITCH_MAX_REQUESTS_PER_MINUTE || '100', 10),
    useEventSub: process.env.TWITCH_USE_EVENTSUB !== 'false', // enabled by default
  },

  // Database (SQLite)
  database: {
    path: process.env.DATABASE_PATH || './data/veronica.db',
    verbose: process.env.DATABASE_VERBOSE === 'true',
  },

  // Cache (Upstash Redis)
  redis: {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    // TTL values in seconds
    liveTTL: parseInt(process.env.REDIS_LIVE_TTL || '300', 10), // 5 minutes
    cooldownTTL: parseInt(process.env.REDIS_COOLDOWN_TTL || '60', 10), // 1 minute
    ratelimitTTL: parseInt(process.env.REDIS_RATELIMIT_TTL || '60', 10), // 1 minute
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '600000', 10),
  },

  // Project paths
  paths: {
    root: projectRoot,
    data: resolve(projectRoot, 'data'),
  },

  // Dashboard API
  api: {
    port: parseInt(process.env.API_PORT || '3001', 10),
    secret: process.env.API_SECRET || 'change-me-in-production',
    dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3000',
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  },
};

export default config;
