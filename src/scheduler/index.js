/**
 * Scheduler
 * Orchestrates polling for YouTube and Twitch platforms
 * 
 * Uses the following check flow:
 * 1. Check Redis cooldown - if present, SKIP API call
 * 2. Check Redis live cache - if present and true, reduce check frequency
 * 3. Call platform API
 * 4. If LIVE: Compare stream_id with database, send notification if new
 * 5. If OFFLINE: Update database and clear Redis cache
 */

import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { creators, streamState, notificationLog } from '../database/queries.js';
import { checkHealth as checkDbHealth } from '../database/index.js';
import {
    isInCooldown,
    setCooldown,
    getLiveStatus,
    setLiveStatus,
    deleteLiveStatus,
    incrementRateLimit,
    checkHealth as checkRedisHealth,
    getStats as getRedisStats,
    isRedisAvailable
} from '../cache/redis.js';
import { checkCreatorsLiveStatus as checkYouTube } from '../services/youtube.js';
import { checkCreatorsLiveStatus as checkTwitch, getUsers as getTwitchUsers } from '../services/twitch.js';
import { sendLiveNotification, updatePresenceWithStats, getStats as getDiscordStats } from '../services/discord.js';

const logger = createLogger('Scheduler');

// Track scheduler state
let isRunning = false;
let youtubeIntervalId = null;
let twitchIntervalId = null;
let healthCheckIntervalId = null;
let presenceRefreshIntervalId = null;
let startTime = Date.now();
let stats = {
    notificationsSent: 0,
    youtubeChecks: 0,
    twitchChecks: 0,
    apiErrors: 0,
};

/**
 * Check if a creator should be polled (respects cooldown)
 */
async function shouldPollCreator(platform, externalId) {
    // Check Redis cooldown first
    const inCooldown = await isInCooldown(platform, externalId);
    if (inCooldown) {
        logger.debug(`Skipping ${externalId} - in cooldown`);
        return false;
    }

    return true;
}

/**
 * Process YouTube live status checks
 */
async function pollYouTube() {
    if (!isRunning) return;

    try {
        const youtubeCreators = await creators.getAllByPlatform('youtube');

        if (youtubeCreators.length === 0) {
            logger.debug('No YouTube creators to check');
            return;
        }

        // Filter out creators in cooldown
        const creatorsToCheck = [];
        for (const creator of youtubeCreators) {
            if (await shouldPollCreator('youtube', creator.external_id)) {
                creatorsToCheck.push(creator);
            }
        }

        if (creatorsToCheck.length === 0) {
            logger.debug('All YouTube creators in cooldown');
            return;
        }

        logger.debug(`Polling ${creatorsToCheck.length}/${youtubeCreators.length} YouTube channels`);

        // Increment rate limit counter
        await incrementRateLimit('youtube');
        stats.youtubeChecks++;

        // Check live status for all creators
        const results = await checkYouTube(creatorsToCheck);

        // Process results
        await Promise.all(results.map(result => processCreatorResult(result, 'youtube')));
    } catch (error) {
        logger.error('YouTube polling error', { error: error.message });
        stats.apiErrors++;
    }
}

/**
 * Process Twitch live status checks
 */
async function pollTwitch() {
    if (!isRunning) return;

    try {
        const twitchCreators = await creators.getAllByPlatform('twitch');

        if (twitchCreators.length === 0) {
            logger.debug('No Twitch creators to check');
            return;
        }

        // Filter out creators in cooldown
        const creatorsToCheck = [];
        for (const creator of twitchCreators) {
            if (await shouldPollCreator('twitch', creator.external_id)) {
                creatorsToCheck.push(creator);
            }
        }

        if (creatorsToCheck.length === 0) {
            logger.debug('All Twitch creators in cooldown');
            return;
        }

        logger.debug(`Polling ${creatorsToCheck.length}/${twitchCreators.length} Twitch streamers`);

        // Increment rate limit counter
        await incrementRateLimit('twitch');
        stats.twitchChecks++;

        // Backfill missing icons
        const creatorsMissingIcon = creatorsToCheck.filter(c => !c.icon_url);
        if (creatorsMissingIcon.length > 0) {
            try {
                // Fetch user data from Twitch
                // Limit to 100 users per request (API limit)
                const idsToFetch = creatorsMissingIcon.map(c => c.external_id).slice(0, 100);
                const users = await getTwitchUsers(idsToFetch);

                // Update database
                for (const user of users) {
                    // Find corresponding creator (case-insensitive for login)
                    const creator = creatorsMissingIcon.find(c => c.external_id.toLowerCase() === user.login.toLowerCase());
                    if (creator && user.profile_image_url) {
                        // Update in DB (passing platform, externalId, displayName ensures upsert works)
                        // Note: we're using the potentially updated display_name from API or keeping existing?
                        // upsert uses external_id as key. 
                        await creators.upsert('twitch', creator.external_id, creator.display_name, user.profile_image_url);
                        logger.debug(`Backfilled icon for ${creator.display_name}`);

                        // Also update the local object so notifications use it immediately if they go live this tick
                        // We need to update the object in the ORIGINAL array 'creatorsToCheck'
                        creator.icon_url = user.profile_image_url;
                    }
                }
            } catch (err) {
                logger.warn('Failed to backfill icons: ' + err.message);
            }
        }

        // Check live status for all creators
        const results = await checkTwitch(creatorsToCheck);

        // Process results
        await Promise.all(results.map(result => processCreatorResult(result, 'twitch')));
    } catch (error) {
        logger.error('Twitch polling error', { error: error.message });
        stats.apiErrors++;
    }
}

/**
 * Process a single creator's check result
 * Implements the mandatory check flow
 * Handles BOTH live streams AND new video uploads (YouTube)
 */
export async function processCreatorResult(result, platform) {
    try {
        const currentState = await streamState.get(result.id);
        const wasLive = currentState?.is_live === true;
        const isNowLive = result.isLive;
        const hasNewVideo = result.hasNewVideo; // YouTube video uploads

        // Handle LIVE STREAMS
        if (isNowLive && result.streamData) {
            const streamId = result.streamData.streamId || result.streamData.videoId;

            // Update state in database
            await streamState.update(result.id, {
                isLive: true,
                streamId: streamId,
                streamTitle: result.streamData.title,
                startedAt: result.streamData.startedAt,
            });

            // Update Redis cache
            await setLiveStatus(platform, result.external_id, true);

            // Check if this is a NEW live stream (not already notified)
            const alreadyNotified = currentState?.last_stream_id === streamId;

            if (!alreadyNotified) {
                logger.info(`🔴 ${result.display_name} went LIVE on ${platform}`);

                // Send notifications
                const count = await sendLiveNotification(result, result.streamData);
                stats.notificationsSent += count;

                // Update bot presence to show who's live
                await updatePresenceWithStats();
            }
        }
        // Handle NEW VIDEO UPLOADS (YouTube only)
        else if (hasNewVideo && result.streamData && platform === 'youtube') {
            const videoId = result.streamData.videoId;

            // Check if we already notified for this video
            const alreadyNotified = currentState?.last_stream_id === videoId;

            if (!alreadyNotified) {
                logger.info(`📹 ${result.display_name} uploaded a new video on YouTube`);

                // Update state to track this video
                await streamState.update(result.id, {
                    isLive: false,
                    streamId: videoId,
                    streamTitle: result.streamData.title,
                    startedAt: result.streamData.publishedAt,
                });

                // Send notifications
                const count = await sendLiveNotification(result, result.streamData);
                stats.notificationsSent += count;
            }
        }
        // Handle STREAM ENDED
        else if (wasLive && !isNowLive) {
            logger.info(`⚫ ${result.display_name} ended their ${platform} stream`);

            // Update database
            await streamState.setOffline(result.id);

            // Clear Redis cache
            await deleteLiveStatus(platform, result.external_id);

            // Update presence
            await updatePresenceWithStats();
        }
        // No changes - just mark as checked
        else {
            await streamState.markChecked(result.id);
        }
    } catch (error) {
        logger.error(`Error processing ${result.display_name}`, { error: error.message });

        // Set cooldown on error to avoid hammering the API
        await setCooldown(platform, result.external_id, 60);
        await streamState.incrementError(result.id);
    }
}

/**
 * Run health check and log statistics
 */
async function runHealthCheck() {
    try {
        const counts = await creators.getCounts();

        const youtubeStats = counts.find(c => c.platform === 'youtube') || { total: 0, live: 0 };
        const twitchStats = counts.find(c => c.platform === 'twitch') || { total: 0, live: 0 };
        const discordStats = getDiscordStats();
        const notificationCount = await notificationLog.getCount();
        const dbHealth = await checkDbHealth();
        const redisHealth = await checkRedisHealth();
        const redisStats = await getRedisStats();

        logger.health({
            youtube: { total: parseInt(youtubeStats.total) || 0, live: parseInt(youtubeStats.live) || 0 },
            twitch: { total: parseInt(twitchStats.total) || 0, live: parseInt(twitchStats.live) || 0 },
            notificationsSent: stats.notificationsSent,
            uptime: Date.now() - startTime,
            discord: discordStats,
            database: dbHealth,
            redis: redisHealth,
            apiChecks: {
                youtube: stats.youtubeChecks,
                twitch: stats.twitchChecks,
                errors: stats.apiErrors,
            },
        });

        // Clean up old notification logs (older than 30 days)
        await notificationLog.cleanup();
    } catch (error) {
        logger.error('Health check failed', { error: error.message });
    }
}

/**
 * Start the scheduler
 */
export function start() {
    if (isRunning) {
        logger.warn('Scheduler is already running');
        return;
    }

    logger.info('Starting scheduler...');
    isRunning = true;
    startTime = Date.now();
    stats = { notificationsSent: 0, youtubeChecks: 0, twitchChecks: 0, apiErrors: 0 };

    // Run initial polls with a slight delay to avoid overwhelming APIs on startup
    setTimeout(() => pollYouTube(), 5000);
    setTimeout(() => pollTwitch(), 3000);

    // Set up polling intervals
    youtubeIntervalId = setInterval(pollYouTube, config.youtube.pollInterval);
    twitchIntervalId = setInterval(pollTwitch, config.twitch.pollInterval);

    // Set up health check interval
    healthCheckIntervalId = setInterval(runHealthCheck, config.logging.healthCheckInterval);

    // Refresh presence every 30 minutes to prevent Discord from expiring the activity
    const PRESENCE_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
    presenceRefreshIntervalId = setInterval(() => {
        logger.debug('Refreshing presence (periodic keep-alive)');
        updatePresenceWithStats();
    }, PRESENCE_REFRESH_INTERVAL);

    logger.info(`✅ Scheduler started`);
    logger.info(`   YouTube poll interval: ${config.youtube.pollInterval / 1000}s`);
    logger.info(`   Twitch poll interval: ${config.twitch.pollInterval / 1000}s`);
    logger.info(`   Health check interval: ${config.logging.healthCheckInterval / 1000}s`);
    logger.info(`   Presence refresh interval: ${PRESENCE_REFRESH_INTERVAL / 1000}s`);
    logger.info(`   Redis caching: ${isRedisAvailable() ? 'enabled' : 'disabled'}`);

    // Run initial health check
    setTimeout(runHealthCheck, 10000);
}

/**
 * Stop the scheduler
 */
export function stop() {
    if (!isRunning) {
        logger.warn('Scheduler is not running');
        return;
    }

    logger.info('Stopping scheduler...');
    isRunning = false;

    if (youtubeIntervalId) {
        clearInterval(youtubeIntervalId);
        youtubeIntervalId = null;
    }

    if (twitchIntervalId) {
        clearInterval(twitchIntervalId);
        twitchIntervalId = null;
    }

    if (healthCheckIntervalId) {
        clearInterval(healthCheckIntervalId);
        healthCheckIntervalId = null;
    }

    if (presenceRefreshIntervalId) {
        clearInterval(presenceRefreshIntervalId);
        presenceRefreshIntervalId = null;
    }

    logger.info('✅ Scheduler stopped');
}

/**
 * Get scheduler status
 */
export function getStatus() {
    return {
        isRunning,
        uptime: isRunning ? Date.now() - startTime : 0,
        ...stats,
        intervals: {
            youtube: config.youtube.pollInterval,
            twitch: config.twitch.pollInterval,
        },
    };
}

/**
 * Force an immediate poll (useful for testing)
 */
export async function forcePoll(platform = 'all') {
    if (platform === 'youtube' || platform === 'all') {
        await pollYouTube();
    }

    if (platform === 'twitch' || platform === 'all') {
        await pollTwitch();
    }
}

export default {
    start,
    stop,
    getStatus,
    forcePoll,
};
