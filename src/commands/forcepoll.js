/**
 * Slash Command: /forcepoll
 * Force an immediate poll check
 * 
 * Made by sdad.pro
 */

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import config from '../config/index.js';
import { forcePoll } from '../scheduler/index.js';

export const data = new SlashCommandBuilder()
    .setName('forcepoll')
    .setDescription('Force an immediate poll check for live streams and videos')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
        option
            .setName('platform')
            .setDescription('Platform to poll')
            .setRequired(false)
            .addChoices(
                { name: 'All', value: 'all' },
                { name: 'YouTube', value: 'youtube' },
                { name: 'Twitch', value: 'twitch' }
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

    const platform = interaction.options.getString('platform') || 'all';

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔄 Manual Poll`)
        .setDescription(`Polling ${platform === 'all' ? 'all platforms' : platform} for updates...`)
        .setTimestamp()
        .setFooter({ text: 'Veronica • Made for Avengers Streamers' });

    await interaction.reply({ embeds: [embed] });

    try {
        const startTime = Date.now();
        await forcePoll(platform);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        const successEmbed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`✅ Poll Complete`)
            .setDescription(`Successfully checked ${platform === 'all' ? 'all platforms' : platform}.`)
            .addFields({
                name: 'Duration',
                value: `${duration}s`,
                inline: true,
            })
            .setTimestamp()
            .setFooter({ text: 'Veronica • Made for Avengers Streamers' });

        await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
        const errorEmbed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle(`❌ Poll Failed`)
            .setDescription(`Error during poll: ${error.message}`)
            .setTimestamp()
            .setFooter({ text: 'Veronica • Made for Avengers Streamers' });

        await interaction.editReply({ embeds: [errorEmbed] });
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
