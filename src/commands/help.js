/**
 * Slash Command: /help
 * Show available commands and bot information
 * 
 * Upgraded by TheVinod
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and bot information');

export async function execute(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📖 Veronica Help')
        .setDescription('A Discord bot for YouTube and Twitch live stream notifications.')
        .addFields(
            {
                name: '📊 `/status`',
                value: 'Show bot status, statistics, and health information.',
                inline: false,
            },
            {
                name: '➕ `/add youtube` or `/add twitch`',
                value: 'Add a new creator to monitor for live streams.\n*Requires: Manage Server*',
                inline: false,
            },
            {
                name: '➖ `/remove`',
                value: 'Remove a creator from monitoring.\n*Requires: Manage Server*',
                inline: false,
            },
            {
                name: '📋 `/list`',
                value: 'List all monitored creators in this server.',
                inline: false,
            },
            {
                name: '🔄 `/forcepoll`',
                value: 'Force an immediate check for live streams.\n*Requires: Manage Server*',
                inline: false,
            },
            {
                name: '❓ `/help`',
                value: 'Show this help message.',
                inline: false,
            }
        )
        .addFields(
            {
                name: '\u200B',
                value: '**Quick Setup:**',
                inline: false,
            },
            {
                name: '1️⃣ Add a YouTube Channel',
                value: '`/add youtube channel_id:UCxxxxxx display_name:CreatorName notification_channel:#live-alerts`',
                inline: false,
            },
            {
                name: '2️⃣ Add a Twitch Streamer',
                value: '`/add twitch username:streamername display_name:StreamerName notification_channel:#live-alerts`',
                inline: false,
            }
        )
        .setTimestamp()
        .setFooter({ text: 'Veronica • Made for Avengers Streamers' });

    await interaction.reply({ embeds: [embed] });
}
