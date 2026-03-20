/**
 * Slash Command: /list
 * List all monitored creators
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../config/index.js';
import { routing } from '../database/queries.js';
import { formatMention } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all monitored creators in this server')
    .addStringOption(option =>
        option
            .setName('platform')
            .setDescription('Filter by platform')
            .setRequired(false)
            .addChoices(
                { name: 'YouTube', value: 'youtube' },
                { name: 'Twitch', value: 'twitch' },
                { name: 'All', value: 'all' }
            )
    );

export async function execute(interaction) {
    await interaction.deferReply();

    const platformFilter = interaction.options.getString('platform') || 'all';

    try {
        // Get all routing rules for this guild (async)
        let routes = await routing.getForGuild(interaction.guildId);

        // Filter by platform if specified
        if (platformFilter !== 'all') {
            routes = routes.filter(r => r.platform === platformFilter);
        }

        if (routes.length === 0) {
            return interaction.editReply({
                content: `📭 No creators are being monitored in this server${platformFilter !== 'all' ? ` for ${platformFilter}` : ''}.`,
            });
        }

        // Group by platform
        const youtube = routes.filter(r => r.platform === 'youtube');
        const twitch = routes.filter(r => r.platform === 'twitch');

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📋 Monitored Creators`)
            .setDescription(`Showing ${routes.length} creator(s) in this server`)
            .setTimestamp()
            .setFooter({ text: 'Veronica • Made for Avengers Streamers' });

        // Add YouTube section
        if (youtube.length > 0 && (platformFilter === 'all' || platformFilter === 'youtube')) {
            const youtubeList = youtube
                .slice(0, 15) // Limit to avoid embed size issues
                .map(r => {
                    const mention = formatMention(r.mention_role_id, interaction.guildId);
                    return `• **${r.display_name}** → <#${r.channel_id}>${mention ? ` (${mention})` : ''}`;
                })
                .join('\n');

            embed.addFields({
                name: `🎬 YouTube (${youtube.length})`,
                value: youtubeList || 'None',
                inline: false,
            });

            if (youtube.length > 15) {
                embed.addFields({
                    name: '\u200B',
                    value: `*...and ${youtube.length - 15} more YouTube channels*`,
                    inline: false,
                });
            }
        }

        // Add Twitch section
        if (twitch.length > 0 && (platformFilter === 'all' || platformFilter === 'twitch')) {
            const twitchList = twitch
                .slice(0, 15)
                .map(r => {
                    const mention = formatMention(r.mention_role_id, interaction.guildId);
                    return `• **${r.display_name}** → <#${r.channel_id}>${mention ? ` (${mention})` : ''}`;
                })
                .join('\n');

            embed.addFields({
                name: `🎮 Twitch (${twitch.length})`,
                value: twitchList || 'None',
                inline: false,
            });

            if (twitch.length > 15) {
                embed.addFields({
                    name: '\u200B',
                    value: `*...and ${twitch.length - 15} more Twitch streamers*`,
                    inline: false,
                });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await interaction.editReply({
            content: `❌ Error listing creators: ${error.message}`,
        });
    }
}
