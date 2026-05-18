/**
 * Twitch User Token Manager
 * 
 * EventSub WebSocket requires a USER access token (not app access token).
 * This module handles:
 * - One-time Device Code Grant flow to obtain user token
 * - Persisting tokens to disk (data/twitch_user_token.json)
 * - Auto-refreshing tokens before they expire
 * 
 * First-time setup: run `node scripts/twitch-auth.js`
 */

import axios from 'axios';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('TwitchAuth');

const TOKEN_FILE = resolve(config.paths.data, 'twitch_user_token.json');
const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';

// In-memory token state
let userAccessToken = null;
let refreshToken = null;
let tokenExpiresAt = null;

/**
 * Load saved token from disk
 * @returns {boolean} True if a valid token was loaded
 */
export function loadToken() {
    try {
        if (!existsSync(TOKEN_FILE)) {
            return false;
        }

        const raw = readFileSync(TOKEN_FILE, 'utf8');
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            logger.warn('Token file is corrupted, ignoring');
            return false;
        }

        userAccessToken = data.access_token;
        refreshToken = data.refresh_token;
        tokenExpiresAt = data.expires_at;

        if (!userAccessToken || !refreshToken) {
            logger.warn('Token file exists but is incomplete');
            return false;
        }

        logger.info('✅ Loaded Twitch user token from disk');
        return true;
    } catch (error) {
        logger.warn('Failed to load Twitch user token', { error: error.message });
        return false;
    }
}

/**
 * Save token to disk
 */
function saveToken() {
    try {
        const data = {
            access_token: userAccessToken,
            refresh_token: refreshToken,
            expires_at: tokenExpiresAt,
            saved_at: new Date().toISOString(),
        };
        writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
        logger.debug('Saved Twitch user token to disk');
    } catch (error) {
        logger.error('Failed to save Twitch user token', { error: error.message });
    }
}

/**
 * Get a valid user access token, refreshing if necessary
 * @returns {string|null} User access token or null if not available
 */
export async function getUserAccessToken() {
    if (!userAccessToken || !refreshToken) {
        const loaded = loadToken();
        if (!loaded) {
            return null;
        }
    }

    // Check if token is still valid (with 5 minute buffer)
    if (tokenExpiresAt && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
        return userAccessToken;
    }

    // Token expired or about to expire — refresh it
    return await refreshAccessToken();
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken() {
    logger.info('Refreshing Twitch user access token...');

    try {
        const response = await axios.post(TWITCH_AUTH_URL, null, {
            params: {
                client_id: config.twitch.clientId,
                client_secret: config.twitch.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            },
        });

        userAccessToken = response.data.access_token;
        refreshToken = response.data.refresh_token;
        tokenExpiresAt = Date.now() + response.data.expires_in * 1000;

        saveToken();

        logger.info('✅ Twitch user access token refreshed', {
            expiresIn: `${Math.floor(response.data.expires_in / 3600)} hours`,
        });

        return userAccessToken;
    } catch (error) {
        logger.error('Failed to refresh Twitch user access token', {
            error: error.response?.data || error.message,
        });
        // Clear tokens so we don't keep trying with bad credentials
        userAccessToken = null;
        return null;
    }
}

/**
 * Store tokens from the Device Code Grant flow (called by setup script)
 */
export function storeTokens(accessToken, refresh, expiresIn) {
    userAccessToken = accessToken;
    refreshToken = refresh;
    tokenExpiresAt = Date.now() + expiresIn * 1000;
    saveToken();
}

/**
 * Check if we have a user token available
 */
export function hasToken() {
    if (userAccessToken && refreshToken) return true;
    return loadToken();
}

export default {
    loadToken,
    getUserAccessToken,
    storeTokens,
    hasToken,
};
