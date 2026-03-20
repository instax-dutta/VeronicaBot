/**
 * Discord embed builders
 * Creates rich embeds for live stream AND video notifications
 * 
 * Upgraded by TheVinod
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import config from '../config/index.js';

// Branding
const BRAND_FOOTER = 'Veronica • Made for Avengers Streamers';
const BRAND_URL = 'https://twitch.tv/vinodsuckatgames'

/**
 * Create a live stream notification embed
 * @param {string} platform - 'youtube' or 'twitch'
 * @param {Object} creator - Creator data
 * @param {boolean} isTest - Whether this is a test notification
 */
export function createLiveEmbed(platform, creator, streamData, isTest = false) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF); // Default color, will be overridden
    // Removed default timestamp and footer as they are customized per platform now

    let components = [];

    if (platform === 'youtube') {
        // Format date: DD-MM-YYYY HH:MM PM
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const footerText = `YouTube Notification • ${dateStr} ${timeStr}`;

        embed
            .setColor(0xFF0000) // YouTube red
            .setFooter({ text: footerText });

        const channelUrl = `https://www.youtube.com/channel/${creator.external_id}`;

        // Check if it's a video upload or live stream
        if (streamData.isVideo) {
            // NEW VIDEO UPLOAD
            const authorText = isTest ? `ℹ️ [TEST] 🔴 New Video Upload!` : `ℹ️ 🔴 New Video Upload!`;

            embed
                .setAuthor({ name: authorText, url: streamData.url })
                .setTitle(streamData.title || 'New Video')
                .setURL(streamData.url || `https://www.youtube.com/watch?v=${streamData.videoId}`)
                .setImage(streamData.thumbnailUrl || `https://i.ytimg.com/vi/${streamData.videoId}/maxresdefault.jpg`);

            const iconUrl = creator.iconUrl || creator.icon_url;
            if (iconUrl) {
                embed.setThumbnail(iconUrl);
            }

            // Fields
            const fields = [];

            // Channel
            fields.push({
                name: '📺 Channel',
                value: creator.display_name,
                inline: true
            });

            // Duration
            if (streamData.duration) {
                const duration = parseDuration(streamData.duration);
                if (duration) {
                    fields.push({
                        name: '⏱️ Duration',
                        value: duration,
                        inline: true,
                    });
                }
            }

            // Published (Relative)
            const publishedTime = streamData.publishedAt ? new Date(streamData.publishedAt) : new Date();
            const unixTime = Math.floor(publishedTime.getTime() / 1000);
            fields.push({
                name: '📅 Published',
                value: `<t:${unixTime}:R>`,
                inline: true,
            });

            embed.addFields(fields);

        } else {
            // LIVE STREAM
            const authorText = isTest
                ? `ℹ️ [TEST] 🔴 ${creator.display_name} is LIVE!`
                : `ℹ️ 🔴 ${creator.display_name} is LIVE!`;

            embed
                .setAuthor({ name: authorText, url: streamData.url })
                .setTitle(streamData.title || 'Live Stream')
                .setURL(streamData.url || `https://www.youtube.com/watch?v=${streamData.videoId}`)
                .setImage(streamData.thumbnailUrl || `https://i.ytimg.com/vi/${streamData.videoId}/maxresdefault.jpg`);

            const iconUrl = creator.iconUrl || creator.icon_url;
            if (iconUrl) {
                embed.setThumbnail(iconUrl);
            }

            // Fields
            const fields = [];

            // Playing / Game (YouTube doesn't always have this, maybe Category?)
            // For consistency, we can skip or show "Live Now"

            // Viewers
            if (streamData.viewers || streamData.viewerCount) {
                fields.push({
                    name: '👁️ Viewers',
                    value: (streamData.viewers || streamData.viewerCount).toLocaleString(),
                    inline: true,
                });
            }

            // Started
            const startTime = streamData.startedAt ? new Date(streamData.startedAt) : new Date();
            const unixTime = Math.floor(startTime.getTime() / 1000);
            fields.push({
                name: '⏱️ Started',
                value: `<t:${unixTime}:R>`,
                inline: true,
            });

            embed.addFields(fields);
        }

        // Action Buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Watch Now')
                    .setStyle(ButtonStyle.Link)
                    .setURL(streamData.url || `https://www.youtube.com/watch?v=${streamData.videoId}`)
                    .setEmoji('▶️'),
                new ButtonBuilder()
                    .setLabel('Visit Channel')
                    .setStyle(ButtonStyle.Link)
                    .setURL(channelUrl)
                    .setEmoji('📺'),
                new ButtonBuilder()
                    .setLabel('Share')
                    .setStyle(ButtonStyle.Link)
                    .setURL(streamData.url || `https://www.youtube.com/watch?v=${streamData.videoId}`)
                    .setEmoji('🔗')
            );
        components.push(row);
    } else if (platform === 'twitch') {
        const channelUrl = `https://twitch.tv/${creator.external_id}`;

        // Format date: DD-MM-YYYY HH:MM PM
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const footerText = `Twitch Notification • ${dateStr} ${timeStr}`;

        const authorName = isTest
            ? `📺 [TEST] 🟢 ${creator.display_name} is LIVE!`
            : `📺 🟢 ${creator.display_name} is LIVE!`;

        embed
            .setColor(0x9146FF) // Twitch purple
            .setAuthor({
                name: streamData.isVideo
                    ? (isTest ? `📺 [TEST] 🟢 ${creator.display_name} uploaded a new VOD!` : `📺 🟢 ${creator.display_name} uploaded a new VOD!`)
                    : authorName,
                url: channelUrl
            })
            .setTitle(streamData.title || 'Live Stream')
            .setURL(channelUrl)
            .setFooter({ text: footerText });

        const iconUrl = creator.iconUrl || creator.icon_url;
        if (iconUrl) {
            embed.setThumbnail(iconUrl);
        }

        if (streamData.isVideo) {
            embed.setURL(streamData.url);
        }

        // Fields
        const fields = [];

        // Playing
        fields.push({
            name: '🎮 Playing',
            value: streamData.game || streamData.gameName || 'Just Chatting',
            inline: true,
        });

        // Viewers
        if (streamData.viewers !== undefined) {
            fields.push({
                name: '👁️ Viewers',
                value: streamData.viewers.toLocaleString(),
                inline: true,
            });
        }

        if (streamData.duration) {
            fields.push({
                name: '⏱️ Duration',
                value: streamData.duration,
                inline: true,
            });
        } else {
            // Started
            const startTime = streamData.startedAt ? new Date(streamData.startedAt) : new Date();
            const unixTime = Math.floor(startTime.getTime() / 1000);
            fields.push({
                name: '⏰ Started',
                value: `<t:${unixTime}:R>`,
                inline: true,
            });
        }

        embed.addFields(fields);

        // Removed thumbnail image - only profile picture is shown

        // Action Buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Watch Stream')
                    .setStyle(ButtonStyle.Link)
                    .setURL(channelUrl)
                    .setEmoji('🔴'), // Using Red Circle for "Watch" as per screenshot which has a red icon
                new ButtonBuilder()
                    .setLabel('Chat')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`${channelUrl}/chat`) // Best guess for chat link
                    .setEmoji('👤'), // Screenshot has a user-like icon
                new ButtonBuilder()
                    .setLabel('Clips')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`${channelUrl}/clips`)
                    .setEmoji('🎥') // Screenshot has a camera/clips icon
            );

        components.push(row);
    }

    return { embed, components };
}

/**
 * Create a "both platforms" embed when a streamer is live on Twitch & YouTube
 * @param {Object} creator - The creator going live now (the second platform)
 * @param {Object} currentStreamData - Stream data for the platform going live now
 * @param {Object} otherPlatformInfo - Info from the existing notification (the first platform)
 */
export function createBothPlatformsEmbed(creator, currentStreamData, otherPlatformInfo) {
    const embed = new EmbedBuilder();
    let components = [];

    // Determine which is twitch and which is youtube
    const isTwitchFirst = otherPlatformInfo.platform === 'twitch';
    const twitchExternalId = isTwitchFirst ? otherPlatformInfo.external_id : creator.external_id;
    const youtubeStreamId = isTwitchFirst ? (currentStreamData.streamId || currentStreamData.videoId) : otherPlatformInfo.last_stream_id;

    const twitchUrl = `https://twitch.tv/${twitchExternalId}`;
    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeStreamId}`;

    // Format date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const footerText = `Multi-Platform Notification • ${dateStr} ${timeStr}`;

    embed
        .setColor(0xFFAC33) // Gold for multi-platform
        .setAuthor({
            name: `🔴 ${creator.display_name} is LIVE on Twitch & YouTube!`,
            url: twitchUrl
        })
        .setTitle(currentStreamData.title || otherPlatformInfo.stream_title || 'Live Stream')
        .setURL(twitchUrl)
        .setFooter({ text: footerText });

    const iconUrl = creator.iconUrl || creator.icon_url || otherPlatformInfo.icon_url;
    if (iconUrl) {
        embed.setThumbnail(iconUrl);
    }

    // Fields
    const fields = [];

    // Game (from Twitch data if available)
    if (currentStreamData.game || currentStreamData.gameName) {
        fields.push({
            name: '🎮 Playing',
            value: currentStreamData.game || currentStreamData.gameName,
            inline: true,
        });
    }

    // Viewers (from current stream data)
    if (currentStreamData.viewers !== undefined || currentStreamData.viewerCount) {
        fields.push({
            name: '👁️ Viewers',
            value: (currentStreamData.viewers || currentStreamData.viewerCount).toLocaleString(),
            inline: true,
        });
    }

    // Started
    const startTime = currentStreamData.startedAt
        ? new Date(currentStreamData.startedAt)
        : (otherPlatformInfo.started_at ? new Date(otherPlatformInfo.started_at) : new Date());
    const unixTime = Math.floor(startTime.getTime() / 1000);
    fields.push({
        name: '⏰ Started',
        value: `<t:${unixTime}:R>`,
        inline: true,
    });

    // Platforms
    fields.push({
        name: '📡 Platforms',
        value: '🟣 Twitch • 🔴 YouTube',
        inline: false,
    });

    embed.addFields(fields);

    // Action Buttons — links to both platforms
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Watch on Twitch')
                .setStyle(ButtonStyle.Link)
                .setURL(twitchUrl)
                .setEmoji('🟣'),
            new ButtonBuilder()
                .setLabel('Watch on YouTube')
                .setStyle(ButtonStyle.Link)
                .setURL(youtubeUrl)
                .setEmoji('🔴'),
            new ButtonBuilder()
                .setLabel('Chat')
                .setStyle(ButtonStyle.Link)
                .setURL(`${twitchUrl}/chat`)
                .setEmoji('👤')
        );

    components.push(row);

    return { embed, components };
}

/**
 * Parse ISO 8601 duration to human-readable format
 * @param {string} duration - ISO 8601 duration (e.g., PT1H2M3S)
 */
function parseDuration(duration) {
    if (!duration) return null;

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format mention string
 * @param {string|null} mentionRoleId - Role ID, 'everyone', 'here', or null
 * @param {string|null} guildId - Guild ID (optional, used to check for @everyone role)
 */
export function formatMention(mentionRoleId, guildId = null) {
    if (!mentionRoleId) return null;

    if (mentionRoleId === 'everyone' || (guildId && mentionRoleId === guildId)) {
        return '@everyone';
    } else if (mentionRoleId === 'here') {
        return '@here';
    } else {
        return `<@&${mentionRoleId}>`;
    }
}

export default {
    createLiveEmbed,
    createBothPlatformsEmbed,
    formatMention,
    BRAND_FOOTER,
    BRAND_URL,
};
