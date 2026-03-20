/**
 * Twitch EventSub WebSocket Service
 * 
 * Connects to Twitch's EventSub WebSocket to receive instant stream.online events.
 * This replaces the need for polling to detect Twitch stream starts — notifications
 * arrive within seconds of a stream going live.
 * 
 * Falls back gracefully: if the WebSocket disconnects, the existing polling in
 * scheduler/index.js continues to work as a safety net.
 */

import WebSocket from 'ws';
import axios from 'axios';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { getUsers, getStreams, parseStreamData } from './twitch.js';
import { getUserAccessToken, hasToken } from './twitchUserToken.js';
import { creators, streamState } from '../database/queries.js';

const logger = createLogger('TwitchEventSub');

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const EVENTSUB_API_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';

// State
let ws = null;
let sessionId = null;
let keepaliveTimeoutId = null;
let keepaliveTimeoutSeconds = 10; // Will be updated from welcome message
let reconnectAttempts = 0;
let isShuttingDown = false;
let activeSubscriptions = new Map(); // externalId -> subscriptionId
let userIdMap = new Map(); // login (lowercase) -> twitch user_id

// Callback for processing stream events
let onStreamOnline = null;

/**
 * Initialize the EventSub WebSocket service
 * @param {Function} streamOnlineHandler - async function(creatorResult, platform) called when stream goes online
 */
export async function init(streamOnlineHandler) {
    if (!config.twitch.useEventSub) {
        logger.info('Twitch EventSub is disabled via config');
        return;
    }

    onStreamOnline = streamOnlineHandler;

    // Check if user token is available
    if (!hasToken()) {
        logger.warn('⚠️  No Twitch user token found. EventSub requires a user access token.');
        logger.warn('   Run: node scripts/twitch-auth.js  to set up authentication.');
        logger.warn('   Falling back to polling only.');
        return;
    }

    // Resolve Twitch login names to user IDs (needed for subscriptions)
    await resolveUserIds();

    // Only connect if we actually have creators to subscribe to
    if (userIdMap.size === 0) {
        logger.info('No Twitch user IDs resolved — skipping EventSub WebSocket connection');
        return;
    }

    // Connect to WebSocket
    connect();
}

/**
 * Resolve all tracked Twitch creator logins to user IDs
 */
async function resolveUserIds() {
    try {
        const twitchCreators = await creators.getAllByPlatform('twitch');
        if (twitchCreators.length === 0) {
            logger.info('No Twitch creators to subscribe to');
            return;
        }

        const logins = twitchCreators.map(c => c.external_id);

        // Batch resolve (getUsers handles up to 100 at once)
        for (let i = 0; i < logins.length; i += 100) {
            const batch = logins.slice(i, i + 100);
            const users = await getUsers(batch);
            for (const user of users) {
                userIdMap.set(user.login.toLowerCase(), user.id);
            }
        }

        logger.info(`Resolved ${userIdMap.size} Twitch user IDs for EventSub`);
    } catch (error) {
        logger.error('Failed to resolve Twitch user IDs', { error: error.message });
    }
}

/**
 * Connect to Twitch EventSub WebSocket
 */
function connect(url = EVENTSUB_WS_URL) {
    if (isShuttingDown) return;

    logger.info(`Connecting to Twitch EventSub WebSocket...`);

    ws = new WebSocket(url);

    ws.on('open', () => {
        logger.info('✅ Twitch EventSub WebSocket connected');
        reconnectAttempts = 0;
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleMessage(message);
        } catch (error) {
            logger.error('Failed to parse EventSub message', { error: error.message });
        }
    });

    ws.on('close', (code, reason) => {
        logger.warn(`EventSub WebSocket closed: ${code} ${reason || ''}`);
        clearKeepaliveTimeout();
        sessionId = null;
        activeSubscriptions.clear();

        // 4003 = connection unused (no subscriptions created) — don't reconnect
        if (!isShuttingDown && code !== 4003) {
            scheduleReconnect();
        } else if (code === 4003) {
            logger.info('Connection closed as unused (4003) — not reconnecting');
        }
    });

    ws.on('error', (error) => {
        logger.error('EventSub WebSocket error', { error: error.message });
    });
}

/**
 * Handle incoming WebSocket messages
 */
async function handleMessage(message) {
    const messageType = message.metadata?.message_type;

    switch (messageType) {
        case 'session_welcome':
            await handleWelcome(message);
            break;

        case 'session_keepalive':
            resetKeepaliveTimeout();
            break;

        case 'notification':
            await handleNotification(message);
            break;

        case 'session_reconnect':
            handleReconnect(message);
            break;

        case 'revocation':
            handleRevocation(message);
            break;

        default:
            logger.debug(`Unknown EventSub message type: ${messageType}`);
    }
}

/**
 * Handle welcome message — subscribe to events
 */
async function handleWelcome(message) {
    sessionId = message.payload.session.id;
    keepaliveTimeoutSeconds = message.payload.session.keepalive_timeout_seconds || 10;

    logger.info(`EventSub session ID: ${sessionId} (keepalive: ${keepaliveTimeoutSeconds}s)`);

    resetKeepaliveTimeout();

    // Subscribe to stream.online for all tracked creators
    await subscribeAllCreators();
}

/**
 * Handle stream.online notification
 */
async function handleNotification(message) {
    const eventType = message.payload.subscription.type;
    const event = message.payload.event;

    resetKeepaliveTimeout();

    if (eventType === 'stream.online') {
        logger.info(`⚡ EventSub: ${event.broadcaster_user_name} went LIVE (instant notification)`);

        try {
            // Fetch full stream data from Helix API
            const streams = await getStreams([event.broadcaster_user_login]);

            if (streams.length === 0) {
                logger.warn(`EventSub: ${event.broadcaster_user_name} went live but no stream data found (may be very brief)`);
                return;
            }

            const streamData = parseStreamData(streams[0]);

            // Look up the creator in the database
            const twitchCreators = await creators.getAllByPlatform('twitch');
            const creator = twitchCreators.find(
                c => c.external_id.toLowerCase() === event.broadcaster_user_login.toLowerCase()
            );

            if (!creator) {
                logger.warn(`EventSub: Creator ${event.broadcaster_user_login} not found in database`);
                return;
            }

            // Build the result object matching what pollTwitch produces
            const result = {
                ...creator,
                streamData,
                isLive: true,
            };

            // Process through the same pipeline as polling
            if (onStreamOnline) {
                await onStreamOnline(result, 'twitch');
            }
        } catch (error) {
            logger.error(`EventSub: Error processing stream.online for ${event.broadcaster_user_name}`, {
                error: error.message,
            });
        }
    }
}

/**
 * Handle reconnect message — Twitch wants us to connect to a new URL
 */
function handleReconnect(message) {
    const reconnectUrl = message.payload.session.reconnect_url;
    logger.info(`EventSub: Reconnecting to ${reconnectUrl}`);

    // Connect to new URL before closing old connection
    const oldWs = ws;
    connect(reconnectUrl);

    // Close old connection after new one is established
    setTimeout(() => {
        if (oldWs && oldWs.readyState === WebSocket.OPEN) {
            oldWs.close();
        }
    }, 5000);
}

/**
 * Handle subscription revocation
 */
function handleRevocation(message) {
    const sub = message.payload.subscription;
    logger.warn(`EventSub subscription revoked: ${sub.type} for ${sub.condition.broadcaster_user_id}`, {
        status: sub.status,
    });

    // Remove from active subscriptions
    for (const [login, subId] of activeSubscriptions.entries()) {
        if (subId === sub.id) {
            activeSubscriptions.delete(login);
            break;
        }
    }
}

/**
 * Subscribe to stream.online for all tracked Twitch creators
 */
async function subscribeAllCreators() {
    const twitchCreators = await creators.getAllByPlatform('twitch');

    let successCount = 0;
    let failCount = 0;

    for (const creator of twitchCreators) {
        const userId = userIdMap.get(creator.external_id.toLowerCase());
        if (!userId) {
            logger.warn(`No user ID for ${creator.display_name} (${creator.external_id}), skipping EventSub subscription`);
            failCount++;
            continue;
        }

        try {
            const subId = await createSubscription('stream.online', {
                broadcaster_user_id: userId,
            });

            if (subId) {
                activeSubscriptions.set(creator.external_id.toLowerCase(), subId);
                successCount++;
                logger.debug(`Subscribed to stream.online for ${creator.display_name}`);
            }
        } catch (error) {
            logger.error(`Failed to subscribe for ${creator.display_name}`, { error: error.message });
            failCount++;
        }
    }

    logger.info(`📡 EventSub subscriptions: ${successCount} active, ${failCount} failed`);
}

/**
 * Subscribe to a single creator (used when a new creator is added).
 * If the EventSub WebSocket is not connected, it will dynamically connect first.
 */
export async function subscribeCreator(externalId, displayName) {
    // Check prerequisites — EventSub must be enabled and have a token
    if (!config.twitch.useEventSub) return;
    if (!hasToken()) {
        logger.debug(`No Twitch user token, skipping EventSub subscription for ${displayName}`);
        return;
    }

    // If WebSocket is not connected, connect now and wait for the session welcome
    if (!sessionId || !ws || ws.readyState !== WebSocket.OPEN) {
        logger.info(`EventSub not connected — connecting dynamically for ${displayName}`);
        connect();

        // Wait up to 10 seconds for the session to be established
        const connected = await waitForSession(10000);
        if (!connected) {
            logger.warn(`Timed out waiting for EventSub session — skipping subscription for ${displayName}`);
            return;
        }
    }

    // Resolve user ID if we don't have it
    let userId = userIdMap.get(externalId.toLowerCase());
    if (!userId) {
        try {
            const users = await getUsers([externalId]);
            if (users.length > 0) {
                userId = users[0].id;
                userIdMap.set(externalId.toLowerCase(), userId);
            }
        } catch (error) {
            logger.error(`Failed to resolve user ID for ${displayName}`, { error: error.message });
            return;
        }
    }

    if (!userId) {
        logger.warn(`Could not resolve user ID for ${displayName}`);
        return;
    }

    try {
        const subId = await createSubscription('stream.online', {
            broadcaster_user_id: userId,
        });

        if (subId) {
            activeSubscriptions.set(externalId.toLowerCase(), subId);
            logger.info(`📡 Subscribed to stream.online for ${displayName} (via EventSub)`);
        }
    } catch (error) {
        logger.error(`Failed to subscribe for ${displayName}`, { error: error.message });
    }
}

/**
 * Wait for the EventSub session to be established (sessionId set by handleWelcome).
 * @param {number} timeoutMs - Max time to wait in ms
 * @returns {Promise<boolean>} true if session established, false on timeout
 */
function waitForSession(timeoutMs) {
    return new Promise((resolve) => {
        if (sessionId) return resolve(true);

        const interval = 250;
        let elapsed = 0;
        const timer = setInterval(() => {
            elapsed += interval;
            if (sessionId) {
                clearInterval(timer);
                resolve(true);
            } else if (elapsed >= timeoutMs) {
                clearInterval(timer);
                resolve(false);
            }
        }, interval);
    });
}

/**
 * Unsubscribe from a creator (used when a creator is removed).
 * Closes the WebSocket if no subscriptions remain.
 */
export async function unsubscribeCreator(externalId) {
    const subId = activeSubscriptions.get(externalId.toLowerCase());
    if (!subId) return;

    try {
        await deleteSubscription(subId);
        activeSubscriptions.delete(externalId.toLowerCase());
        logger.info(`Unsubscribed from EventSub for ${externalId}`);

        // If no subscriptions remain, close the WebSocket cleanly
        if (activeSubscriptions.size === 0 && ws) {
            logger.info('No active EventSub subscriptions remaining — closing WebSocket');
            // Set a flag so the close handler doesn't try to reconnect
            const prevShutdown = isShuttingDown;
            isShuttingDown = true;
            ws.close();
            ws = null;
            sessionId = null;
            clearKeepaliveTimeout();
            isShuttingDown = prevShutdown;
        }
    } catch (error) {
        logger.warn(`Failed to unsubscribe ${externalId}`, { error: error.message });
    }
}

/**
 * Create an EventSub subscription via Helix API
 */
async function createSubscription(type, condition) {
    const token = await getUserAccessToken();

    if (!token) {
        logger.error('No user access token available for EventSub subscription');
        throw new Error('No user access token available');
    }

    try {
        const response = await axios.post(EVENTSUB_API_URL, {
            type,
            version: '1',
            condition,
            transport: {
                method: 'websocket',
                session_id: sessionId,
            },
        }, {
            headers: {
                'Client-ID': config.twitch.clientId,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        const sub = response.data.data?.[0];
        return sub?.id || null;
    } catch (error) {
        // 409 = subscription already exists, that's fine
        if (error.response?.status === 409) {
            logger.debug(`Subscription already exists for ${type} ${JSON.stringify(condition)}`);
            return null;
        }

        logger.error(`Failed to create EventSub subscription`, {
            type,
            status: error.response?.status,
            error: error.response?.data || error.message,
        });
        throw error;
    }
}

/**
 * Delete an EventSub subscription
 */
async function deleteSubscription(subscriptionId) {
    const token = await getUserAccessToken();

    if (!token) {
        logger.error('No user access token available for EventSub subscription');
        throw new Error('No user access token available');
    }

    await axios.delete(`${EVENTSUB_API_URL}?id=${subscriptionId}`, {
        headers: {
            'Client-ID': config.twitch.clientId,
            'Authorization': `Bearer ${token}`,
        },
    });
}

/**
 * Reset the keepalive timeout
 * If we don't receive any message within keepaliveTimeout + buffer, reconnect
 */
function resetKeepaliveTimeout() {
    clearKeepaliveTimeout();

    // Add a buffer of 10 seconds to the keepalive timeout
    const timeoutMs = (keepaliveTimeoutSeconds + 10) * 1000;

    keepaliveTimeoutId = setTimeout(() => {
        logger.warn('EventSub keepalive timeout — reconnecting...');

        if (ws) {
            ws.close();
        }
    }, timeoutMs);
}

/**
 * Clear the keepalive timeout
 */
function clearKeepaliveTimeout() {
    if (keepaliveTimeoutId) {
        clearTimeout(keepaliveTimeoutId);
        keepaliveTimeoutId = null;
    }
}

/**
 * Schedule a reconnection with exponential backoff
 */
function scheduleReconnect() {
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Max 30s

    logger.info(`Reconnecting to EventSub in ${delay / 1000}s (attempt ${reconnectAttempts})`);

    setTimeout(() => {
        if (!isShuttingDown) {
            connect();
        }
    }, delay);
}

/**
 * Get EventSub status
 */
export function getStatus() {
    return {
        connected: ws !== null && ws.readyState === WebSocket.OPEN,
        sessionId,
        activeSubscriptions: activeSubscriptions.size,
        reconnectAttempts,
    };
}

/**
 * Shutdown the EventSub service
 */
export function shutdown() {
    isShuttingDown = true;
    clearKeepaliveTimeout();

    if (ws) {
        logger.info('Closing EventSub WebSocket...');
        ws.close();
        ws = null;
    }

    sessionId = null;
    activeSubscriptions.clear();
    userIdMap.clear();

    logger.info('✅ EventSub service shut down');
}

export default {
    init,
    subscribeCreator,
    unsubscribeCreator,
    getStatus,
    shutdown,
};
