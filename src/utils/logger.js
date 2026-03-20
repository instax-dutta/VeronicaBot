/**
 * Logger utility
 * Provides consistent logging across the application with levels and formatting
 */

import config from '../config/index.js';

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const currentLevel = LOG_LEVELS[config.logging.level] || LOG_LEVELS.info;

/**
 * Format a log message with timestamp and level
 */
function formatMessage(level, component, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${component}]`;

    if (data) {
        return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
}

/**
 * Create a logger instance for a specific component
 */
export function createLogger(component) {
    return {
        debug(message, data = null) {
            if (currentLevel <= LOG_LEVELS.debug) {
                console.log(formatMessage('debug', component, message, data));
            }
        },

        info(message, data = null) {
            if (currentLevel <= LOG_LEVELS.info) {
                console.log(formatMessage('info', component, message, data));
            }
        },

        warn(message, data = null) {
            if (currentLevel <= LOG_LEVELS.warn) {
                console.warn(formatMessage('warn', component, message, data));
            }
        },

        error(message, data = null) {
            if (currentLevel <= LOG_LEVELS.error) {
                console.error(formatMessage('error', component, message, data));
            }
        },

        // Special method for health checks
        health(stats) {
            const timestamp = new Date().toISOString();
            console.log(`\n${'='.repeat(70)}`);
            console.log(`🏥 HEALTH CHECK - ${timestamp}`);
            console.log(`${'='.repeat(70)}`);
            console.log(`📊 Creators monitored:`);
            console.log(`   YouTube: ${stats.youtube.total} (${stats.youtube.live} live)`);
            console.log(`   Twitch:  ${stats.twitch.total} (${stats.twitch.live} live)`);
            console.log(`📬 Notifications sent: ${stats.notificationsSent}`);
            console.log(`⏱️  Uptime: ${formatUptime(stats.uptime)}`);
            console.log(`💾 Memory: ${formatMemory(process.memoryUsage().heapUsed)}`);

            // Database health
            console.log(`🗄️  Database (NeonDB): ${stats.database?.healthy ? '✅ Connected' : `❌ ${stats.database?.error || 'Error'}`}`);

            // Redis health
            console.log(`⚡ Cache (Redis): ${stats.redis?.healthy ? `✅ Connected (${stats.redis.latency}ms)` : `⚠️ ${stats.redis?.error || 'Not available'}`}`);

            // API check counts
            if (stats.apiChecks) {
                console.log(`📡 API Checks: YouTube=${stats.apiChecks.youtube}, Twitch=${stats.apiChecks.twitch}, Errors=${stats.apiChecks.errors}`);
            }

            console.log(`${'='.repeat(70)}\n`);
        },
    };
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

/**
 * Format bytes in human-readable format
 */
function formatMemory(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
}

// Default logger instance
export const logger = createLogger('Main');

export default logger;
