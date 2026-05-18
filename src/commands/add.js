/**
 * Slash Command: /add
 * Add a new creator to monitor
 */

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { creators, streamState, routing } from '../database/queries.js';
import twitchService from '../services/twitch.js';
import youtubeService from '../services/youtube.js';
import twitchEventSub from '../services/twitchEventSub.js';

const logger = createLogger('Commands:Add');

export const data = new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a new creator to monitor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
        subcommand
            .setName('youtube')
            .setDescription('Add a YouTube channel')
            .addStringOption(option =>
                option
                    .setName('channel_id')
                    .setDescription('YouTube channel ID (UC...) or handle (@username)')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('display_name')
                    .setDescription('Display name for the creator')
                    .setRequired(true)
            )
            .addChannelOption(option =>
                option
                    .setName('notification_channel')
                    .setDescription('Discord channel for notifications')
                    .setRequired(true)
            )
            .addRoleOption(option =>
                option
                    .setName('mention_role')
                    .setDescription('Role to mention when live (optional)')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('twitch')
            .setDescription('Add a Twitch streamer')
            .addStringOption(option =>
                option
                    .setName('username')
                    .setDescription('Twitch username')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('display_name')
                    .setDescription('Display name for the creator')
                    .setRequired(true)
            )
            .addChannelOption(option =>
                option
                    .setName('notification_channel')
                    .setDescription('Discord channel for notifications')
                    .setRequired(true)
            )
            .addRoleOption(option =>
                option
                    .setName('mention_role')
                    .setDescription('Role to mention when live (optional)')
                    .setRequired(false)
            )
    );

export async function execute(interaction) {
    // Check permissions
    if (!hasPermission(interaction)) {
        return interaction.reply({
            content: '❌ You do not have permission to use this command.',
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const displayName = interaction.options.getString('display_name');
    const notificationChannel = interaction.options.getChannel('notification_channel');
    const mentionRole = interaction.options.getRole('mention_role');

    try {
        let externalId;
        let platform;

        if (subcommand === 'youtube') {
            externalId = interaction.options.getString('channel_id');
            platform = 'youtube';

            // Check if it's a handle (@username) or channel ID (UC...)
            if (externalId.startsWith('@')) {
                // It's a handle, resolve it to channel ID
                const channelId = await youtubeService.resolveHandle(externalId);

                if (!channelId) {
                    return interaction.editReply({
                        content: `❌ Could not find YouTube channel with handle: **${externalId}**\nPlease check the spelling and try again.`,
                    });
                }

                externalId = channelId;
            } else if (!externalId.startsWith('UC') || externalId.length !== 24) {
                // Not a handle and not a valid channel ID
                return interaction.editReply({
                    content: '❌ Invalid YouTube channel ID or handle.\n\n**Valid formats:**\n• Channel ID: `UC...` (24 characters)\n• Handle: `@username`',
                });
            }
        } else if (subcommand === 'twitch') {
            const usernameInput = interaction.options.getString('username').toLowerCase();
            platform = 'twitch';

            // Validate Twitch username format
            if (!/^[a-z0-9_]{4,25}$/.test(usernameInput)) {
                return interaction.editReply({
                    content: '❌ Invalid Twitch username. Must be 4-25 characters, lowercase letters, numbers, and underscores only.',
                });
            }

            // Verify user exists on Twitch
            let twitchUsers = [];
            try {
                twitchUsers = await twitchService.getUsers([usernameInput]);

                if (twitchUsers.length === 0) {
                    return interaction.editReply({
                        content: `❌ Twitch user **${usernameInput}** not found. Please check the spelling.`,
                    });
                }

                // Use the data from Twitch to ensure accuracy
                const twitchUser = twitchUsers[0];
                externalId = twitchUser.login;

            } catch (error) {
                return interaction.editReply({
                    content: `❌ Failed to verify Twitch user: ${error.message}`,
                });
            }
        }

        // Determine icon URL for this creator (avoid redundant API calls)
        let iconUrl = null;
        if (subcommand === 'twitch' && twitchUsers.length > 0 && twitchUsers[0].profile_image_url) {
            iconUrl = twitchUsers[0].profile_image_url;
        }

        // Add creator to database
        const creatorId = await creators.upsert(platform, externalId, displayName, iconUrl);

        // Ensure stream state exists
        await streamState.ensureExists(creatorId);

        // Add routing
        await routing.add(
            creatorId,
            interaction.guildId,
            notificationChannel.id,
            mentionRole?.id || null
        );

        // If Twitch creator, subscribe to EventSub dynamically (no restart needed)
        if (platform === 'twitch') {
            twitchEventSub.subscribeCreator(externalId, displayName).catch(err => {
                logger.debug(`EventSub subscribe failed for ${displayName}: ${err.message}`);
            });
        }

        // Create success embed
        const embed = new EmbedBuilder()
            .setColor(platform === 'youtube' ? 0xFF0000 : 0x9146FF)
            .setTitle(`✅ Creator Added`)
            .setDescription(`Successfully added **${displayName}** to monitoring!`)
            .addFields(
                {
                    name: 'Platform',
                    value: platform === 'youtube' ? '🎬 YouTube' : '🎮 Twitch',
                    inline: true,
                },
                {
                    name: 'ID/Username',
                    value: externalId,
                    inline: true,
                },
                {
                    name: 'Notification Channel',
                    value: `<#${notificationChannel.id}>`,
                    inline: true,
                }
            );

        if (mentionRole) {
            embed.addFields({
                name: 'Mention Role',
                value: mentionRole.toString(),
                inline: true,
            });
        }

        if (iconUrl) {
            embed.setThumbnail(iconUrl);
        }

        embed.setTimestamp().setFooter({ text: 'Veronica • Made for Avengers Streamers' });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await interaction.editReply({
            content: `❌ Error adding creator: ${error.message}`,
        });
    }
}

/**
 * Check if user has permission to use this command
 */
function hasPermission(interaction) {
    // Check if user is in admin list
    if (config.discord.adminIds.length > 0) {
        if (config.discord.adminIds.includes(interaction.user.id)) {
            return true;
        }
    }

    // Check if user has Manage Guild permission
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}
