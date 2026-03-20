/**
 * Redis Cache Layer (Upstash)
 * 
 * Redis is a SECONDARY cache layer. It is ephemeral and replaceable.
 * If Redis data is lost, the bot MUST still behave correctly using NeonDB alone.
 * 
 * Redis is used ONLY for:
 * - Live state cache (reduce DB queries)
 * - Rate-limit counters
 * - Cooldown timers (for API backoff)
 * 
 * DO NOT store authoritative state in Redis.
 */

import { Redis } from '@upstash/redis';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Redis');

// Redis client singleton
let redis = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
export async function initRedis() {
    if (redis && isConnected) {
        return redis;
    }

    logger.info('Connecting to Upstash Redis...');

    try {
        redis = new Redis({
            url: config.redis.url,
            token: config.redis.token,
        });

        // Test connection
        await redis.ping();
        isConnected = true;

        logger.info('✅ Connected to Upstash Redis');
        return redis;
    } catch (error) {
        logger.error('Failed to connect to Upstash Redis', { error: error.message });
        isConnected = false;
        // Don't throw - Redis is optional
        return null;
    }
}

/**
 * Get Redis client (may be null if not connected)
 */
export function getRedis() {
    return isConnected ? redis : null;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable() {
    return isConnected && redis !== null;
}

// ===========================================
// KEY GENERATORS
// ===========================================

const KEYS = {
    live: (platform, externalId) => `live:${platform}:${externalId}`,
    cooldown: (platform, externalId) => `cooldown:${platform}:${externalId}`,
    ratelimit: (platform) => `ratelimit:${platform}`,
    lastCheck: (platform) => `lastcheck:${platform}`,
};

// ===========================================
// LIVE STATE CACHE
// ===========================================

/**
 * Set live status in cache
 * @param {string} platform - 'youtube' or 'twitch'
 * @param {string} externalId - Channel ID or username
 * @param {boolean} isLive - Live status
 */
export async function setLiveStatus(platform, externalId, isLive) {
    if (!isRedisAvailable()) return;

    try {
        const key = KEYS.live(platform, externalId);
        await redis.set(key, isLive ? 'true' : 'false', {
            ex: config.redis.liveTTL, // TTL in seconds
        });
    } catch (error) {
        logger.warn('Redis setLiveStatus failed', { error: error.message });
        // Continue without Redis
    }
}

/**
 * Get live status from cache
 * @returns {boolean|null} - Live status or null if not cached
 */
export async function getLiveStatus(platform, externalId) {
    if (!isRedisAvailable()) return null;

    try {
        const key = KEYS.live(platform, externalId);
        const value = await redis.get(key);

        if (value === null) return null;
        return value === 'true';
    } catch (error) {
        logger.warn('Redis getLiveStatus failed', { error: error.message });
        return null;
    }
}

/**
 * Delete live status from cache
 */
export async function deleteLiveStatus(platform, externalId) {
    if (!isRedisAvailable()) return;

    try {
        const key = KEYS.live(platform, externalId);
        await redis.del(key);
    } catch (error) {
        logger.warn('Redis deleteLiveStatus failed', { error: error.message });
    }
}

// ===========================================
// COOLDOWN MANAGEMENT
// ===========================================

/**
 * Set cooldown for a creator (after API error)
 * @param {string} platform - Platform
 * @param {string} externalId - Channel ID or username
 * @param {number} durationSeconds - Cooldown duration in seconds
 */
export async function setCooldown(platform, externalId, durationSeconds = null) {
    if (!isRedisAvailable()) return;

    const duration = durationSeconds || config.redis.cooldownTTL;

    try {
        const key = KEYS.cooldown(platform, externalId);
        const expiresAt = Date.now() + (duration * 1000);
        await redis.set(key, expiresAt.toString(), {
            ex: duration,
        });
    } catch (error) {
        logger.warn('Redis setCooldown failed', { error: error.message });
    }
}

/**
 * Check if creator is in cooldown
 * @returns {boolean} - True if in cooldown, false otherwise
 */
export async function isInCooldown(platform, externalId) {
    if (!isRedisAvailable()) return false;

    try {
        const key = KEYS.cooldown(platform, externalId);
        const value = await redis.get(key);
        return value !== null;
    } catch (error) {
        logger.warn('Redis isInCooldown failed', { error: error.message });
        return false; // Assume no cooldown on error
    }
}

/**
 * Clear cooldown for a creator
 */
export async function clearCooldown(platform, externalId) {
    if (!isRedisAvailable()) return;

    try {
        const key = KEYS.cooldown(platform, externalId);
        await redis.del(key);
    } catch (error) {
        logger.warn('Redis clearCooldown failed', { error: error.message });
    }
}

// ===========================================
// RATE LIMIT COUNTERS
// ===========================================

/**
 * Increment rate limit counter for a platform
 * @returns {number} - Current count (or 0 if Redis unavailable)
 */
export async function incrementRateLimit(platform) {
    if (!isRedisAvailable()) return 0;

    try {
        const key = KEYS.ratelimit(platform);
        const count = await redis.incr(key);

        // Set TTL on first increment
        if (count === 1) {
            await redis.expire(key, config.redis.ratelimitTTL);
        }

        return count;
    } catch (error) {
        logger.warn('Redis incrementRateLimit failed', { error: error.message });
        return 0;
    }
}

/**
 * Get current rate limit count
 */
export async function getRateLimitCount(platform) {
    if (!isRedisAvailable()) return 0;

    try {
        const key = KEYS.ratelimit(platform);
        const count = await redis.get(key);
        return count ? parseInt(count, 10) : 0;
    } catch (error) {
        logger.warn('Redis getRateLimitCount failed', { error: error.message });
        return 0;
    }
}

// ===========================================
// HEALTH & WARMUP
// ===========================================

/**
 * Check Redis health
 */
export async function checkHealth() {
    if (!redis) {
        return { healthy: false, error: 'Not initialized' };
    }

    try {
        const start = Date.now();
        await redis.ping();
        const latency = Date.now() - start;

        return { healthy: true, latency };
    } catch (error) {
        isConnected = false;
        return { healthy: false, error: error.message };
    }
}

/**
 * Warm cache from database
 * Sets initial live status in Redis based on NeonDB state
 */
export async function warmCache(creatorsWithState) {
    if (!isRedisAvailable()) return;

    logger.info('Warming Redis cache from database...');

    let warmed = 0;
    for (const creator of creatorsWithState) {
        if (creator.is_live) {
            await setLiveStatus(creator.platform, creator.external_id, true);
            warmed++;
        }
    }

    logger.info(`✅ Warmed ${warmed} live status entries in Redis cache`);
}

/**
 * Get cache statistics
 */
export async function getStats() {
    if (!isRedisAvailable()) {
        return { available: false };
    }

    try {
        // Get counts of different key types
        const [youtubeRL, twitchRL] = await Promise.all([
            getRateLimitCount('youtube'),
            getRateLimitCount('twitch'),
        ]);

        return {
            available: true,
            ratelimits: {
                youtube: youtubeRL,
                twitch: twitchRL,
            },
        };
    } catch (error) {
        return { available: false, error: error.message };
    }
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedis() {
    if (redis) {
        logger.info('Closing Redis connection...');
        // Upstash Redis REST client doesn't need explicit close
        redis = null;
        isConnected = false;
        logger.info('✅ Redis connection closed');
    }
}

export default {
    initRedis,
    getRedis,
    isRedisAvailable,
    setLiveStatus,
    getLiveStatus,
    deleteLiveStatus,
    setCooldown,
    isInCooldown,
    clearCooldown,
    incrementRateLimit,
    getRateLimitCount,
    checkHealth,
    warmCache,
    getStats,
    closeRedis,
};
