/**
 * Slash Command: /status
 * Shows bot status and statistics
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../config/index.js';
import { creators, notificationLog } from '../database/queries.js';
import { checkHealth as checkDbHealth } from '../database/index.js';
import { checkHealth as checkRedisHealth, getStats as getRedisStats } from '../cache/redis.js';
import { getLimiterStats } from '../services/rateLimiter.js';
import { getStatus as getSchedulerStatus } from '../scheduler/index.js';

export const data = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show bot status and statistics');

export async function execute(interaction) {
    await interaction.deferReply();

    try {
        // Get statistics (all async now)
        const [counts, notificationCount, schedulerStatus, limiterStats, dbHealth, redisHealth] = await Promise.all([
            creators.getCounts(),
            notificationLog.getCount(),
            Promise.resolve(getSchedulerStatus()),
            getLimiterStats(),
            checkDbHealth(),
            checkRedisHealth(),
        ]);

        const youtubeStats = counts.find(c => c.platform === 'youtube') || { total: 0, live: 0 };
        const twitchStats = counts.find(c => c.platform === 'twitch') || { total: 0, live: 0 };

        // Format uptime
        const uptimeMs = schedulerStatus.uptime;
        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);
        const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`📊 ${config.discord.botName} Status`)
            .setDescription('Live stream notification bot status')
            .addFields(
                {
                    name: '🎬 YouTube',
                    value: `**${youtubeStats.total}** channels\n**${youtubeStats.live || 0}** live`,
                    inline: true,
                },
                {
                    name: '🎮 Twitch',
                    value: `**${twitchStats.total}** streamers\n**${twitchStats.live || 0}** live`,
                    inline: true,
                },
                {
                    name: '📬 Notifications',
                    value: `**${notificationCount}** sent`,
                    inline: true,
                },
                {
                    name: '⏱️ Uptime',
                    value: uptimeStr,
                    inline: true,
                },
                {
                    name: '🔄 Scheduler',
                    value: schedulerStatus.isRunning ? '✅ Running' : '❌ Stopped',
                    inline: true,
                },
                {
                    name: '💾 Memory',
                    value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
                    inline: true,
                },
                {
                    name: '🗄️ Database (NeonDB)',
                    value: dbHealth.healthy ? '✅ Connected' : `❌ ${dbHealth.error}`,
                    inline: true,
                },
                {
                    name: '⚡ Cache (Redis)',
                    value: redisHealth.healthy ? `✅ ${redisHealth.latency}ms` : `⚠️ ${redisHealth.error || 'Not available'}`,
                    inline: true,
                },
                {
                    name: '📡 Rate Limiters',
                    value: [
                        `YouTube: ${limiterStats.youtube.reservoir} remaining`,
                        `Twitch: ${limiterStats.twitch.reservoir} remaining`,
                        `Discord: ${limiterStats.discord.reservoir} remaining`,
                    ].join('\n'),
                    inline: false,
                }
            )
            .setTimestamp()
            .setFooter({ text: 'Veronica • Made for Avengers Streamers' });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await interaction.editReply({
            content: `❌ Error getting status: ${error.message}`,
        });
    }
}
