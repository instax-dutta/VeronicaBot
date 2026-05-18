/**
 * Discord service
 * Handles bot client, message sending, notification delivery, and slash commands
 */

import { Client, GatewayIntentBits, Events, ActivityType } from 'discord.js';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { createLiveEmbed, createBothPlatformsEmbed, formatMention } from '../utils/embeds.js';
import { discordRateLimiter } from './rateLimiter.js';
import { routing, notificationLog, streamState, creators } from '../database/queries.js';
import {
    loadCommands,
    registerCommands,
    setupCommandHandler,
    setPresence,
    updatePresence
} from '../commands/index.js';

const logger = createLogger('Discord');

// Discord client instance
let client = null;

/**
 * Initialize the Discord client with slash commands
 */
export async function initClient() {
    if (client && client.isReady()) {
        return client;
    }

    logger.info('Initializing Discord client...');

    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
        ],
    });

    // Load slash commands
    await loadCommands();

    // Event handlers
    client.once(Events.ClientReady, async (c) => {
        logger.info(`✅ Discord bot "${config.discord.botName}" logged in as ${c.user.tag}`);
        logger.info(`📊 Connected to ${c.guilds.cache.size} servers`);

        // Register slash commands
        await registerCommands(client);

        // Set up command handler
        setupCommandHandler(client);

        // Set bot presence
        setPresence(client);

        // Update presence with creator count
        await updatePresenceWithStats();
    });

    client.on(Events.Error, (error) => {
        logger.error('Discord client error', { error: error.message });
    });

    client.on(Events.Warn, (warning) => {
        logger.warn('Discord client warning', { warning });
    });

    client.on(Events.GuildCreate, async (guild) => {
        logger.info(`Joined new server: ${guild.name} (${guild.id})`);
        await updatePresenceWithStats();
    });

    client.on(Events.GuildDelete, async (guild) => {
        logger.info(`Left server: ${guild.name} (${guild.id})`);
        await updatePresenceWithStats();
    });

    // Login
    try {
        await client.login(config.discord.token);
        return client;
    } catch (error) {
        logger.error('Failed to login to Discord', { error: error.message });
        throw error;
    }
}

/**
 * Update presence with current statistics
 * Now async since queries are async
 */
export async function updatePresenceWithStats() {
    if (!client || !client.isReady()) return;

    try {
        // Fetch all creators to check who is live
        const [youtubeCreators, twitchCreators] = await Promise.all([
            creators.getAllByPlatform('youtube'),
            creators.getAllByPlatform('twitch')
        ]);

        const allLive = [
            ...youtubeCreators.filter(c => c.is_live),
            ...twitchCreators.filter(c => c.is_live)
        ];

        // For verification purposes, we will ALWAYS show the Avengers presence
        // logic as requested, even if no streams are active.

        let activity = {};

        if (allLive.length === 0) {
            // Case 0: No one is live
            activity = {
                name: `Watching Avengers Comms System`,
                type: ActivityType.Streaming,
                url: "https://twitch.tv/vinodsuckatgames",
                details: "Watching Avengers Comms System",
                state: "Monitoring Twitch and Youtube",
            };
        } else if (allLive.length === 1) {
            // Case 1: One person live
            const stream = allLive[0];
            let streamUrl = 'https://twitch.tv/vinodsuckatgames'; // Default

            if (stream.platform === 'youtube') {
                streamUrl = `https://www.youtube.com/watch?v=${stream.last_stream_id}`;
            } else {
                streamUrl = `https://twitch.tv/${stream.external_id}`;
            }

            const platformName = stream.platform === 'youtube' ? 'YouTube' : 'Twitch';

            activity = {
                name: `${stream.display_name} is live on ${platformName}`,
                type: ActivityType.Streaming,
                url: streamUrl,
                details: stream.stream_title || 'Broadcasting Live',
                state: `Live on ${stream.platform === 'youtube' ? 'YouTube' : 'Twitch'}`,
                timestamps: stream.started_at ? { start: new Date(stream.started_at).getTime() } : undefined,
                assets: {
                    large_image: 'avengers',
                    large_text: stream.display_name,
                    small_image: stream.platform, // 'youtube' or 'twitch'
                    small_text: stream.platform === 'youtube' ? 'YouTube' : 'Twitch',
                },
                buttons: [
                    { label: 'Watch Stream', url: streamUrl },
                    { label: 'Join Discord', url: 'https://discord.gg/7r9qVmybJA' } // Placeholder
                ]
            };
        } else {
            // Case N: Multiple live
            const first = allLive[0];
            let streamUrl = 'https://twitch.tv/discord';

            if (first.platform === 'youtube') {
                streamUrl = `https://www.youtube.com/watch?v=${first.last_stream_id}`;
            } else {
                streamUrl = `https://twitch.tv/${first.external_id}`;
            }

            // Group streamers by platform for a descriptive state
            const twitchLive = allLive.filter(c => c.platform === 'twitch');
            const youtubeLive = allLive.filter(c => c.platform === 'youtube');

            const parts = [];
            if (twitchLive.length > 0) {
                const twitchNames = twitchLive.map(c => c.display_name).join(' ');
                parts.push(`${twitchNames} ${twitchLive.length === 1 ? 'is' : 'are'} live on Twitch`);
            }
            if (youtubeLive.length > 0) {
                const ytNames = youtubeLive.map(c => c.display_name).join(' ');
                parts.push(`${ytNames} ${youtubeLive.length === 1 ? 'is' : 'are'} live on YouTube`);
            }

            const stateText = parts.join(' | ');
            const names = allLive.map(c => c.display_name).join(' ');

            activity = {
                name: `Avengers Assemble ${names}`, // "Streaming Avengers Assemble jkrahul csignite"
                type: ActivityType.Streaming,
                url: streamUrl, // Required for streaming status
                details: `Monitoring ${allLive.length} Missions`,
                state: stateText.length > 120 ? `${stateText.substring(0, 117)}...` : stateText,
                assets: {
                    large_image: 'avengers',
                    large_text: 'Avengers Assemble',
                }
            };
        }

        // Log the App ID to ensure it matches the one with uploaded assets
        if (client.application) {
            logger.debug(`🤖 Bot App ID: ${client.application.id}`);
        }

        // Construct the Presence Data
        const presenceData = {
            activities: [activity],
            status: 'online', // Always online
        };

        logger.debug(`Updating presence with advanced assets (Forced)`);
        client.user.setPresence(presenceData);

    } catch (error) {
        // Ignore errors during presence update
        logger.debug('Presence update failed', { error: error.message });
    }
}

/**
 * Get the Discord client instance
 */
export function getClient() {
    return client;
}

/**
 * Send a notification to a Discord channel
 * @param {string} channelId - Discord channel ID
 * @param {Object} embed - EmbedBuilder instance
 * @param {string|null} mention - Optional mention string
 */
async function sendNotification(channelId, embed, mention = null, components = []) {
    return discordRateLimiter.schedule(async () => {
        try {
            const channel = await client.channels.fetch(channelId);

            if (!channel || !channel.isTextBased()) {
                logger.warn(`Channel ${channelId} not found or not a text channel`);
                return null;
            }

            const messageContent = {
                embeds: [embed],
                components: components,
            };

            if (mention) {
                messageContent.content = mention;
            }

            const message = await channel.send(messageContent);
            logger.info(`Notification sent to channel ${channelId}`);
            return message.id;
        } catch (error) {
            if (error.code === 50013) {
                logger.error(`Missing permissions in channel ${channelId} — bot cannot send messages there`);
            } else if (error.code === 10003) {
                logger.warn(`Channel ${channelId} was deleted, removing from routing`);
            } else if (error.code === 429) {
                logger.warn(`Discord rate limited on channel ${channelId}, will retry`);
            } else {
                logger.error(`Failed to send notification to ${channelId}`, {
                    error: error.message,
                });
            }
            return null;
        }
    });
}

/**
 * Send live notification for a creator
 * Handles routing to multiple channels and duplicate prevention
 * 
 * @param {Object} creator - Creator data
 * @param {Object} streamData - Stream details
 * @returns {number} Number of notifications sent
 */
export async function sendLiveNotification(creator, streamData) {
    if (!client || !client.isReady()) {
        logger.error('Discord client not ready');
        return 0;
    }

    // Get routing rules for this creator
    const routes = await routing.getForCreator(creator.id);

    if (routes.length === 0) {
        logger.warn(`No routing rules found for creator ${creator.display_name}`);
        return 0;
    }

    const streamId = streamData.streamId || streamData.videoId;

    const results = await Promise.all(routes.map(async (route) => {
        // Check if notification was already sent for this stream in this channel
        const alreadySent = await notificationLog.exists(creator.id, streamId, route.channel_id);
        if (alreadySent) {
            logger.debug(`Notification already sent for ${creator.display_name} stream ${streamId} in channel ${route.channel_id}`);
            return 0;
        }

        // Cross-platform merge: check if same display_name is already live on the other platform
        if (!streamData.isVideo) {
            try {
                const existingNotification = await notificationLog.findCrossPlatform(
                    creator.display_name, route.channel_id, creator.platform
                );

                if (existingNotification && existingNotification.message_id) {
                    logger.info(`🔀 Cross-platform merge: ${creator.display_name} is live on both platforms, editing existing notification`);

                    // Create a "both platforms" embed
                    const { embed: mergedEmbed, components: mergedComponents } = createBothPlatformsEmbed(
                        creator, streamData, existingNotification
                    );

                    // Edit the existing message
                    try {
                        const channel = await client.channels.fetch(route.channel_id);
                        if (channel && channel.isTextBased()) {
                            const existingMessage = await channel.messages.fetch(existingNotification.message_id);
                            await existingMessage.edit({
                                embeds: [mergedEmbed],
                                components: mergedComponents,
                            });

                            // Log this notification too (so it won't be sent again)
                            await notificationLog.add(creator.id, streamId, route.guild_id, route.channel_id, existingNotification.message_id);
                            await streamState.markNotified(creator.id);

                            logger.info(`✅ Edited notification for ${creator.display_name} to show both platforms`);
                            return 1;
                        }
                    } catch (editError) {
                        logger.warn(`Failed to edit cross-platform notification, falling back to new message`, {
                            error: editError.message
                        });
                        // Fall through to send a new notification
                    }
                }
            } catch (crossPlatformError) {
                logger.debug(`Cross-platform check failed, sending normally`, {
                    error: crossPlatformError.message
                });
            }
        }

        // Create the embed and components
        const { embed, components } = createLiveEmbed(creator.platform, creator, streamData);

        // Format mention with context
        const baseMention = formatMention(route.mention_role_id, route.guild_id);
        let mention = baseMention;
        if (baseMention) {
            if (streamData.isVideo) {
                mention = `${baseMention} **${creator.display_name}** posted a new video! 📹`;
            } else {
                const platformName = creator.platform === 'youtube' ? 'YouTube' : 'Twitch';
                mention = `${baseMention} **${creator.display_name}** is now live on ${platformName}! 🔴`;
            }
        }

        // Send notification
        const messageId = await sendNotification(route.channel_id, embed, mention, components);

        if (messageId) {
            // Log the notification with message ID for cross-platform edit support
            await notificationLog.add(creator.id, streamId, route.guild_id, route.channel_id, messageId);

            // Update stream state
            await streamState.markNotified(creator.id);

            return 1;
        }
        return 0;
    }));

    const sentCount = results.reduce((a, b) => a + b, 0);

    if (sentCount > 0) {
        logger.info(`📢 Sent ${sentCount} notifications for ${creator.display_name}`);

        // Update presence to reflect live count
        await updatePresenceWithStats();
    }

    return sentCount;
}

/**
 * Get bot statistics
 */
export function getStats() {
    if (!client || !client.isReady()) {
        return { guilds: 0, channels: 0, ready: false };
    }

    return {
        guilds: client.guilds.cache.size,
        channels: client.channels.cache.size,
        ready: true,
        uptime: client.uptime,
        botName: config.discord.botName,
    };
}

/**
 * Gracefully shutdown the Discord client
 */
export async function shutdown() {
    if (client) {
        logger.info('Shutting down Discord client...');
        client.destroy();
        client = null;
        logger.info('✅ Discord client shut down');
    }
}

/**
 * Verify the bot token is valid and bot has necessary permissions
 */
export async function verifyCredentials() {
    try {
        const c = await initClient();

        if (c.isReady()) {
            logger.info('✅ Discord credentials verified');
            return true;
        }

        return false;
    } catch (error) {
        logger.error('❌ Discord credentials invalid');
        return false;
    }
}

export default {
    initClient,
    getClient,
    sendLiveNotification,
    getStats,
    shutdown,
    verifyCredentials,
    updatePresenceWithStats,
};
