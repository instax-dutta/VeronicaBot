/**
 * Slash Command: /test-notification
 * manually invoke the notification embed to test permissions and styling
 */

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createLiveEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('test-notification')
    .setDescription('Send a test notification to verify permissions')
    .addStringOption(option =>
        option.setName('platform')
            .setDescription('Platform to test')
            .setRequired(true)
            .addChoices(
                { name: 'YouTube', value: 'youtube' },
                { name: 'Twitch', value: 'twitch' }
            )
    )
    .addChannelOption(option =>
        option.setName('channel')
            .setDescription('Channel to send to (defaults to current)')
            .setRequired(false)
    );

export async function execute(interaction) {
    if (!interaction.memberPermissions?.has('ManageGuild')) {
        return interaction.reply({ content: '❌ missing permissions', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const platform = interaction.options.getString('platform');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    // Fake data for the test
    const fakeCreator = {
        platform: platform,
        external_id: platform === 'youtube' ? 'UCTestCase123' : 'test_user',
        display_name: 'Test Streamer',
        iconUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/1f9c44bc-a8c2-4467-8d3e-dbe6d3b88c8e-profile_image-300x300.png'
    };

    const fakeStream = {
        streamId: '12345',
        title: 'This is a TEST Notification',
        gameName: 'Just Chatting',
        viewers: 29, // Changed from viewerCount to match embed code
        startedAt: new Date().toISOString(),
        thumbnailUrl: platform === 'youtube'
            ? 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
            : 'https://static-cdn.jtvnw.net/previews-ttv/live_user_discord-{width}x{height}.jpg',
        url: platform === 'youtube'
            ? 'https://youtube.com'
            : 'https://twitch.tv',
        isVideo: false
    };

    try {
        const { embed, components } = createLiveEmbed(platform, fakeCreator, fakeStream, true);

        await targetChannel.send({
            content: `🔔 [TEST] Notification for **${platform}**`,
            embeds: [embed],
            components: components
        });

        await interaction.editReply(`✅ Test notification sent to ${targetChannel}`);
    } catch (err) {
        await interaction.editReply(`❌ Failed: ${err.message}`);
    }
}
