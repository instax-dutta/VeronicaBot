/**
 * Slash Command: /remove
 * Remove a creator from monitoring
 */

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import config from '../config/index.js';
import { creators, routing } from '../database/queries.js';
import twitchEventSub from '../services/twitchEventSub.js';

export const data = new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a creator from monitoring')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
        option
            .setName('platform')
            .setDescription('Platform of the creator')
            .setRequired(true)
            .addChoices(
                { name: 'YouTube', value: 'youtube' },
                { name: 'Twitch', value: 'twitch' }
            )
    )
    .addStringOption(option =>
        option
            .setName('identifier')
            .setDescription('[v2] Search Channel ID (YouTube) or username (Twitch)')
            .setAutocomplete(true)
            .setRequired(true)
    )
    .addBooleanOption(option =>
        option
            .setName('remove_all_servers')
            .setDescription('Remove from all servers (default: only this server)')
            .setRequired(false)
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

    const platform = interaction.options.getString('platform');
    let identifier = interaction.options.getString('identifier');
    const removeAllServers = interaction.options.getBoolean('remove_all_servers') ?? false;

    // Normalize Twitch username
    if (platform === 'twitch') {
        identifier = identifier.toLowerCase();
    }

    try {
        // Find the creator (async)
        const creator = await creators.getByExternalId(platform, identifier);

        if (!creator) {
            return interaction.editReply({
                content: `❌ Creator not found with ${platform === 'youtube' ? 'channel ID' : 'username'}: ${identifier}`,
            });
        }

        if (removeAllServers) {
            // Remove creator entirely (cascades to routing and state)
            await creators.delete(creator.id);

            // Unsubscribe from EventSub if Twitch creator
            if (platform === 'twitch') {
                twitchEventSub.unsubscribeCreator(identifier).catch(() => { });
            }

            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('🗑️ Creator Removed')
                .setDescription(`**${creator.display_name}** has been removed from all servers.`)
                .addFields(
                    { name: 'Platform', value: platform === 'youtube' ? '🎬 YouTube' : '🎮 Twitch', inline: true },
                    { name: 'ID/Username', value: identifier, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Veronica • Made for Avengers Streamers' });

            await interaction.editReply({ embeds: [embed] });
        } else {
            // Remove only routing for this server
            const routes = await routing.getForCreator(creator.id);
            const serverRoutes = routes.filter(r => r.guild_id === interaction.guildId);

            if (serverRoutes.length === 0) {
                return interaction.editReply({
                    content: `❌ **${creator.display_name}** is not being monitored in this server.`,
                });
            }

            // Remove routing for this server
            for (const route of serverRoutes) {
                await routing.delete(route.id);
            }

            // If no routes remain for this creator, unsubscribe from EventSub
            if (platform === 'twitch') {
                const remainingRoutes = await routing.getForCreator(creator.id);
                if (remainingRoutes.length === 0) {
                    twitchEventSub.unsubscribeCreator(identifier).catch(() => { });
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('🔕 Notifications Disabled')
                .setDescription(`**${creator.display_name}** notifications have been disabled for this server.`)
                .addFields(
                    { name: 'Platform', value: platform === 'youtube' ? '🎬 YouTube' : '🎮 Twitch', inline: true },
                    { name: 'Channels removed', value: serverRoutes.length.toString(), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Veronica • Made for Avengers Streamers' });

            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        await interaction.editReply({
            content: `❌ Error removing creator: ${error.message}`,
        });
    }
}

/**
 * Check if user has permission to use this command
 */
function hasPermission(interaction) {
    if (config.discord.adminIds.length > 0) {
        if (config.discord.adminIds.includes(interaction.user.id)) {
            return true;
        }
    }
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}
/**
 * Handle autocomplete
 */
export async function autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const platform = interaction.options.getString('platform');

    try {
        // Get all creators monitored in this guild
        const routes = await routing.getForGuild(interaction.guildId);

        if (routes.length === 0) {
            return interaction.respond([]);
        }

        // Filter by platform if selected
        let filtered = routes;
        if (platform) {
            filtered = routes.filter(r => r.platform === platform);
        }

        // Filter by search term (fuzzy match)
        if (focusedValue) {
            const search = focusedValue.toLowerCase();
            filtered = filtered.filter(r =>
                r.display_name.toLowerCase().includes(search) ||
                r.external_id.toLowerCase().includes(search)
            );
        }

        // Limit to 25 results (Discord API limit)
        await interaction.respond(
            filtered.slice(0, 25).map(choice => ({
                name: `${choice.display_name} (${choice.external_id})`,
                value: choice.external_id,
            }))
        );
    } catch (error) {
        console.error('Autocomplete error:', error);
        await interaction.respond([]);
    }
}
