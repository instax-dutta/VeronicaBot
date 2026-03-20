/**
 * Twitch API service
 * Handles OAuth, stream status checks, and batched API requests
 */

import axios from 'axios';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { twitchRateLimiter, updateTwitchLimits, pauseLimiter } from './rateLimiter.js';

const logger = createLogger('Twitch');

// OAuth token storage
let accessToken = null;
let tokenExpiresAt = null;

// API base URL
const TWITCH_API_BASE = 'https://api.twitch.tv/helix';
const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';

/**
 * Get or refresh OAuth access token
 * Uses client credentials flow (app access token)
 */
export async function getAccessToken() {
    // Check if token is valid (with 5 minute buffer)
    if (accessToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
        return accessToken;
    }

    logger.info('Obtaining new Twitch access token...');

    try {
        const response = await axios.post(TWITCH_AUTH_URL, null, {
            params: {
                client_id: config.twitch.clientId,
                client_secret: config.twitch.clientSecret,
                grant_type: 'client_credentials',
            },
        });

        accessToken = response.data.access_token;
        tokenExpiresAt = Date.now() + response.data.expires_in * 1000;

        logger.info('✅ Twitch access token obtained', {
            expiresIn: `${Math.floor(response.data.expires_in / 3600)} hours`,
        });

        return accessToken;
    } catch (error) {
        logger.error('Failed to obtain Twitch access token', {
            error: error.response?.data || error.message,
        });
        throw error;
    }
}

// Transient network error codes that warrant a retry
const RETRYABLE_ERRORS = new Set([
    'EAI_AGAIN',      // DNS lookup timeout
    'ECONNRESET',     // Connection reset
    'ETIMEDOUT',      // Connection timed out
    'ENOTFOUND',      // DNS lookup failed
    'ECONNABORTED',   // Connection aborted
    'EPIPE',          // Broken pipe
    'EHOSTUNREACH',   // Host unreachable
    'UND_ERR_CONNECT_TIMEOUT', // Undici connect timeout
]);

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryableError(error) {
    if (error.code && RETRYABLE_ERRORS.has(error.code)) return true;
    const msg = error.message || '';
    return RETRYABLE_ERRORS.has(msg.split(' ').pop()) ||
        msg.includes('EAI_AGAIN') || msg.includes('ECONNRESET');
}

/**
 * Make an authenticated API request to Twitch
 * Includes retry with exponential backoff for transient network errors
 */
async function twitchRequest(endpoint, params = {}) {
    const token = await getAccessToken();

    return twitchRateLimiter.schedule(async () => {
        let lastError;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await axios.get(`${TWITCH_API_BASE}${endpoint}`, {
                    headers: {
                        'Client-ID': config.twitch.clientId,
                        'Authorization': `Bearer ${token}`,
                    },
                    params,
                });

                // Update rate limiter based on response headers
                if (response.headers['ratelimit-remaining']) {
                    updateTwitchLimits(response.headers);
                }

                return response.data;
            } catch (error) {
                lastError = error;

                // Non-retryable: rate limit
                if (error.response?.status === 429) {
                    const resetTime = error.response.headers['ratelimit-reset'];
                    const waitTime = resetTime ? (parseInt(resetTime, 10) * 1000 - Date.now()) : 60000;

                    logger.warn(`Twitch rate limited, waiting ${waitTime}ms`);
                    pauseLimiter(twitchRateLimiter, Math.max(waitTime, 1000), 'Twitch 429');

                    throw error;
                }

                // Non-retryable: auth failure
                if (error.response?.status === 401) {
                    logger.warn('Twitch token expired, refreshing...');
                    accessToken = null;
                    tokenExpiresAt = null;
                    throw error;
                }

                // Retry transient network errors
                if (isRetryableError(error) && attempt < MAX_RETRIES) {
                    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                    logger.warn(`Transient error on ${endpoint}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`, {
                        code: error.code || error.message,
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Non-retryable or exhausted retries
                logger.error('Twitch API request failed', {
                    endpoint,
                    status: error.response?.status,
                    error: error.response?.data || error.message,
                    attempts: attempt + 1,
                });

                throw error;
            }
        }

        throw lastError;
    });
}

/**
 * Get user information by login names (up to 100 at a time)
 * @param {string[]} logins - Array of Twitch login names
 */
export async function getUsers(logins) {
    if (logins.length === 0) return [];
    if (logins.length > 100) {
        throw new Error('Cannot request more than 100 users at once');
    }

    const params = new URLSearchParams();
    logins.forEach(login => params.append('login', login));

    // Pass URLSearchParams directly - axios handles it correctly
    const data = await twitchRequest('/users', params);
    return data.data || [];
}

/**
 * Get stream status for multiple users (batched, up to 100 at a time)
 * @param {string[]} userLogins - Array of Twitch login names
 * @returns {Object[]} Array of live stream objects
 */
export async function getStreams(userLogins) {
    if (userLogins.length === 0) return [];

    const allStreams = [];

    // Batch in groups of 100 (Twitch API limit)
    for (let i = 0; i < userLogins.length; i += 100) {
        const batch = userLogins.slice(i, i + 100);

        const params = new URLSearchParams();
        batch.forEach(login => params.append('user_login', login));

        try {
            // Pass URLSearchParams directly - axios handles it correctly
            // DO NOT use Object.fromEntries() - it loses duplicate keys!
            const data = await twitchRequest('/streams', params);

            if (data.data && data.data.length > 0) {
                allStreams.push(...data.data);
            }
        } catch (error) {
            logger.error(`Failed to get streams for batch ${i / 100 + 1}`, {
                error: error.message,
            });
            // Continue with other batches
        }
    }

    return allStreams;
}

/**
 * Get videos (VODs) for a user
 * @param {string} userId - Twitch user ID
 * @param {number} limit - Number of videos to fetch (default 1)
 */
export async function getVideos(userId, limit = 1) {
    const params = {
        user_id: userId,
        first: limit,
        sort: 'time',
        type: 'archive', // Only get past broadcasts (VODs)
    };

    try {
        const data = await twitchRequest('/videos', params);
        return data.data || [];
    } catch (error) {
        logger.error(`Failed to get videos for user ${userId}`, { error: error.message });
        throw error;
    }
}

/**
 * Parse stream data into a consistent format
 */
export function parseStreamData(stream) {
    return {
        streamId: stream.id,
        title: stream.title,
        game: stream.game_name,
        viewerCount: stream.viewer_count,
        startedAt: stream.started_at,
        thumbnailUrl: stream.thumbnail_url
            .replace('{width}', '1280')
            .replace('{height}', '720')
            // Add cache buster to avoid Discord caching old thumbnails
            + `?t=${Date.now()}`,
        userId: stream.user_id,
        userLogin: stream.user_login,
        userName: stream.user_name,
        isLive: stream.type === 'live',
    };
}

/**
 * Check live status for an array of creators
 * Returns only those that are currently live
 */
export async function checkCreatorsLiveStatus(creators) {
    const logins = creators.map(c => c.external_id);

    if (logins.length === 0) {
        return [];
    }

    logger.debug(`Checking ${logins.length} Twitch channels...`);

    try {
        const streams = await getStreams(logins);

        // Create a map of login -> stream data
        const liveMap = new Map();
        for (const stream of streams) {
            liveMap.set(stream.user_login.toLowerCase(), parseStreamData(stream));
        }

        logger.debug(`Found ${liveMap.size} live Twitch streams`);

        // Return creators with live stream data attached
        return creators.map(creator => ({
            ...creator,
            streamData: liveMap.get(creator.external_id.toLowerCase()) || null,
            isLive: liveMap.has(creator.external_id.toLowerCase()),
        }));
    } catch (error) {
        logger.error('Failed to check Twitch live status', { error: error.message });
        throw error;
    }
}

/**
 * Get stream URL for a user
 */
export function getStreamUrl(userLogin) {
    return `https://twitch.tv/${userLogin}`;
}

/**
 * Verify the Twitch credentials are valid
 */
export async function verifyCredentials() {
    try {
        await getAccessToken();
        logger.info('✅ Twitch credentials verified');
        return true;
    } catch (error) {
        logger.error('❌ Twitch credentials invalid');
        return false;
    }
}

export default {
    getAccessToken,
    getUsers,
    getStreams,
    getVideos,
    parseStreamData,
    checkCreatorsLiveStatus,
    getStreamUrl,
    verifyCredentials,
};
