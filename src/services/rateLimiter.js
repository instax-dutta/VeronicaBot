/**
 * Rate limiter using Bottleneck
 * Provides separate queues for YouTube and Twitch APIs
 */

import Bottleneck from 'bottleneck';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('RateLimiter');

/**
 * YouTube rate limiter
 * - Quota-based (10,000 units/day)
 * - Conservative approach to preserve quota
 */
export const youtubeRateLimiter = new Bottleneck({
    reservoir: config.youtube.maxRequestsPerMinute,
    reservoirRefreshAmount: config.youtube.maxRequestsPerMinute,
    reservoirRefreshInterval: 60 * 1000, // Per minute
    maxConcurrent: 2,
    minTime: 200, // Minimum 200ms between requests
});

// Log when reservoir is depleted
youtubeRateLimiter.on('depleted', () => {
    logger.warn('YouTube rate limit reservoir depleted, requests will be queued');
});

// Error handler
youtubeRateLimiter.on('error', (error) => {
    logger.error('YouTube rate limiter error', { error: error.message });
});

/**
 * Twitch rate limiter
 * - Header-based (800 requests/minute)
 * - More generous limits
 */
export const twitchRateLimiter = new Bottleneck({
    reservoir: config.twitch.maxRequestsPerMinute,
    reservoirRefreshAmount: config.twitch.maxRequestsPerMinute,
    reservoirRefreshInterval: 60 * 1000, // Per minute
    maxConcurrent: 5,
    minTime: 100, // Minimum 100ms between requests
});

// Log when reservoir is depleted
twitchRateLimiter.on('depleted', () => {
    logger.warn('Twitch rate limit reservoir depleted, requests will be queued');
});

// Error handler
twitchRateLimiter.on('error', (error) => {
    logger.error('Twitch rate limiter error', { error: error.message });
});

/**
 * Discord rate limiter
 * - More conservative for message sending
 */
export const discordRateLimiter = new Bottleneck({
    reservoir: 30,
    reservoirRefreshAmount: 30,
    reservoirRefreshInterval: 60 * 1000,
    maxConcurrent: 2,
    minTime: 500, // Minimum 500ms between messages
});

discordRateLimiter.on('error', (error) => {
    logger.error('Discord rate limiter error', { error: error.message });
});

/**
 * Update Twitch rate limiter based on response headers
 * Call this after each Twitch API response
 */
export function updateTwitchLimits(headers) {
    const remaining = parseInt(headers['ratelimit-remaining'], 10);
    const reset = parseInt(headers['ratelimit-reset'], 10);

    if (!isNaN(remaining) && remaining < 50) {
        const now = Math.floor(Date.now() / 1000);
        const waitTime = (reset - now) * 1000;

        if (waitTime > 0) {
            logger.warn(`Twitch rate limit low (${remaining}), pausing for ${waitTime}ms`);
            twitchRateLimiter.updateSettings({
                reservoir: 0,
            });

            setTimeout(() => {
                twitchRateLimiter.updateSettings({
                    reservoir: config.twitch.maxRequestsPerMinute,
                });
                logger.info('Twitch rate limit reset, resuming requests');
            }, waitTime);
        }
    }
}

/**
 * Pause a limiter for a specified duration (used for backoff)
 * Uses a monotonic token system to prevent race conditions from overlapping pauses
 */
const pauseTokens = new WeakMap();

export function pauseLimiter(limiter, durationMs, reason = 'manual') {
    logger.warn(`Pausing rate limiter for ${durationMs}ms: ${reason}`);

    const token = Symbol('pause');
    if (!pauseTokens.has(limiter)) {
        pauseTokens.set(limiter, { currentToken: null, scheduledResume: false });
    }
    const state = pauseTokens.get(limiter);
    state.currentToken = token;

    limiter.updateSettings({ reservoir: 0 });

    setTimeout(() => {
        const currentState = pauseTokens.get(limiter);
        if (!currentState || currentState.currentToken !== token) {
            return;
        }

        currentState.currentToken = null;
        const isYoutube = limiter === youtubeRateLimiter;
        const maxRequests = isYoutube
            ? config.youtube.maxRequestsPerMinute
            : config.twitch.maxRequestsPerMinute;

        limiter.updateSettings({ reservoir: maxRequests });
        logger.info(`Rate limiter resumed after pause`);
    }, durationMs);
}

/**
 * Get current limiter statistics
 */
export async function getLimiterStats() {
    return {
        youtube: {
            reservoir: await youtubeRateLimiter.currentReservoir(),
            queued: youtubeRateLimiter.queued(),
            running: youtubeRateLimiter.running(),
        },
        twitch: {
            reservoir: await twitchRateLimiter.currentReservoir(),
            queued: twitchRateLimiter.queued(),
            running: twitchRateLimiter.running(),
        },
        discord: {
            reservoir: await discordRateLimiter.currentReservoir(),
            queued: discordRateLimiter.queued(),
            running: discordRateLimiter.running(),
        },
    };
}

export default {
    youtubeRateLimiter,
    twitchRateLimiter,
    discordRateLimiter,
    updateTwitchLimits,
    pauseLimiter,
    getLimiterStats,
};
