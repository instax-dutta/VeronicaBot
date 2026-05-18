/**
 * VeronicaBot - Production Discord Bot for YouTube & Twitch Live Notifications
 * 
 * Version 2.0.0 - SQLite + Redis Architecture
 * 
 * Entry point for the application
 * Handles initialization, graceful shutdown, and error handling
 * 
 * Architecture:
 * - SQLite: PRIMARY source of truth for all data
 * - Upstash Redis: SECONDARY cache layer (ephemeral, replaceable)
 */

import config from './config/index.js';
import { createLogger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './database/index.js';
import { initRedis, closeRedis, warmCache, isRedisAvailable } from './cache/redis.js';
import { initClient, shutdown as shutdownDiscord } from './services/discord.js';
import { verifyCredentials as verifyTwitch } from './services/twitch.js';
import { verifyCredentials as verifyYouTube, estimateQuotaUsage } from './services/youtube.js';
import { start as startScheduler, stop as stopScheduler, processCreatorResult } from './scheduler/index.js';
import { init as initEventSub, shutdown as shutdownEventSub } from './services/twitchEventSub.js';
import { startApiServer, stopApiServer } from './api/index.js';
import { creators } from './database/queries.js';

const logger = createLogger('Main');
const BOT_NAME = config.discord.botName;

// Track shutdown state
let isShuttingDown = false;

/**
 * Verify all API credentials before starting
 */
async function verifyAllCredentials() {
    logger.info('Verifying API credentials...');

    const results = await Promise.all([
        verifyYouTube(),
        verifyTwitch(),
    ]);

    const [youtubeOk, twitchOk] = results;

    if (!youtubeOk) {
        logger.error('YouTube API key is invalid. Please check your .env file.');
        return false;
    }

    if (!twitchOk) {
        logger.error('Twitch credentials are invalid. Please check your .env file.');
        return false;
    }

    return true;
}

/**
 * Print startup banner
 */
function printBanner() {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🔔 ${BOT_NAME.toUpperCase().padEnd(50)}  ║
║                                                           ║
║   YouTube & Twitch Live Notification Bot                  ║
║   Version 2.0.0 (SQLite + Redis)                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
}

/**
 * Print creator statistics
 */
async function printStats() {
    try {
        const counts = await creators.getCounts();

        const youtubeCount = counts.find(c => c.platform === 'youtube')?.total || 0;
        const twitchCount = counts.find(c => c.platform === 'twitch')?.total || 0;

        console.log('');
        console.log('📊 Creator Statistics:');
        console.log(`   YouTube channels: ${youtubeCount}`);
        console.log(`   Twitch streamers: ${twitchCount}`);
        console.log(`   Total:            ${parseInt(youtubeCount) + parseInt(twitchCount)}`);
        console.log('');

        // Estimate quota usage
        if (parseInt(youtubeCount) > 0) {
            const quota = estimateQuotaUsage(parseInt(youtubeCount));
            console.log('📉 YouTube Quota Estimate (per day):');
            console.log(`   Estimated usage: ${quota.dailyCost} units`);
            console.log(`   Daily limit:     10,000 units`);
            console.log(`   Status:          ${quota.withinQuota ? '✅ Within quota' : '⚠️ May exceed quota'}`);
            console.log('');
        }
    } catch (error) {
        logger.warn('Could not fetch creator statistics', { error: error.message });
    }
}

/**
 * Warm the Redis cache from database state
 */
async function warmCacheFromDB() {
    if (!isRedisAvailable()) {
        logger.info('Redis not available, skipping cache warmup');
        return;
    }

    try {
        // Get all creators with their current state
        const [youtubeCreators, twitchCreators] = await Promise.all([
            creators.getAllByPlatform('youtube'),
            creators.getAllByPlatform('twitch'),
        ]);

        const allCreators = [...youtubeCreators, ...twitchCreators];
        await warmCache(allCreators);
    } catch (error) {
        logger.warn('Cache warmup failed', { error: error.message });
        // Non-fatal - continue without cache warmup
    }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress...');
        return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
        // Stop the scheduler and EventSub first
        stopScheduler();
        shutdownEventSub();

        // Stop API server
        await stopApiServer();

        // Force exit after 5 seconds if graceful shutdown fails
        setTimeout(() => {
            logger.error('Shutdown timed out, forcing exit');
            process.exit(1);
        }, 5000).unref();

        // Shutdown Discord client
        await shutdownDiscord();

        // Close Redis connection
        await closeRedis();

        // Close database connection
        await closeDatabase();

        logger.info('✅ Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
    }
}

/**
 * Main application entry point
 */
async function main() {
    printBanner();

    logger.info(`Starting ${BOT_NAME}...`);

    try {
        // Step 1: Initialize SQLite database
        logger.info('Step 1/5: Connecting to SQLite database...');
        await initDatabase();

        // Step 2: Initialize Upstash Redis
        logger.info('Step 2/5: Connecting to Upstash Redis...');
        await initRedis();

        // Step 3: Print stats
        logger.info('Step 3/5: Loading statistics...');
        await printStats();

        // Step 4: Verify credentials
        logger.info('Step 4/5: Verifying API credentials...');
        const credentialsValid = await verifyAllCredentials();
        if (!credentialsValid) {
            logger.error('Failed to verify API credentials. Exiting.');
            process.exit(1);
        }

        // Step 5: Initialize Discord client
        logger.info('Step 5/5: Initializing Discord client...');
        await initClient();

        // Warm cache from database (optional, non-blocking)
        warmCacheFromDB().catch(err => {
            logger.debug('Cache warmup failed (non-critical)', { error: err.message });
        });

        // Start the scheduler
        startScheduler();

        // Initialize Twitch EventSub for instant notifications
        initEventSub(processCreatorResult).catch(err => {
            logger.warn('EventSub initialization failed, falling back to polling only', { error: err.message });
        });

        // Start the Dashboard API server
        startApiServer().catch(err => {
            logger.warn('Dashboard API server failed to start', { error: err.message });
        });

        logger.info(`🚀 ${BOT_NAME} is running!`);
        console.log('Server is running'); // Pelican panel startup detection
        logger.info('Slash commands are ready. Press Ctrl+C to stop.');
        logger.info('');
        logger.info('📖 Architecture:');
        logger.info('   Database: SQLite - PRIMARY source of truth');
        logger.info(`   Cache:    Upstash Redis - ${isRedisAvailable() ? '✅ Connected' : '⚠️ Not available (using DB only)'}`);
        logger.info(`   Dashboard API: Port ${config.api.port}`);

    } catch (error) {
        logger.error(`Failed to start ${BOT_NAME}`, { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// Set up shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors - bot must NOT crash
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    // Don't exit - try to keep running
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason: reason?.message || reason });
    // Don't exit - try to keep running
});

// Start the application
main();
