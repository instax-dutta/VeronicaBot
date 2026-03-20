/**
 * Dashboard REST API Server
 * Express server embedded in the bot process
 * 
 * Provides endpoints for the Next.js dashboard to manage:
 * - Creators (CRUD)
 * - Routing rules (CRUD)
 * - Bot stats & health
 * - Notification logs
 * - Discord OAuth verification
 */

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { requireAuth, generateToken } from './middleware.js';
import { creators, routing, notificationLog, streamState } from '../database/queries.js';
import { checkHealth as checkDbHealth } from '../database/index.js';
import redis from '../cache/redis.js';
import discord from '../services/discord.js';
import scheduler from '../scheduler/index.js';

const logger = createLogger('API');

let server = null;

/**
 * Start the Express API server
 */
export async function startApiServer() {
    const app = express();
    const port = config.api.port;

    // Middleware
    app.use(cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g. server-to-server, curl)
            if (!origin) return callback(null, true);

            const dashboardUrl = config.api.dashboardUrl;
            // In development, also allow any localhost/LAN origin on the dashboard port
            const dashboardPort = new URL(dashboardUrl).port || '3000';
            const isAllowed =
                origin === dashboardUrl ||
                origin.match(new RegExp(`^https?://(localhost|127\\.0\\.0\\.1|\\d+\\.\\d+\\.\\d+\\.\\d+):${dashboardPort}$`));

            if (isAllowed) {
                callback(null, origin);
            } else {
                callback(new Error(`CORS: origin ${origin} not allowed`));
            }
        },
        credentials: true,
    }));
    app.use(express.json());

    // Request logging
    app.use((req, res, next) => {
        logger.debug(`${req.method} ${req.path}`);
        next();
    });

    // ─── Public Routes ───────────────────────────────────

    /**
     * Health check (public)
     */
    app.get('/api/health', async (req, res) => {
        try {
            const [dbHealth, redisHealth] = await Promise.all([
                checkDbHealth(),
                redis.checkHealth(),
            ]);

            const discordStats = discord.getStats();

            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                services: {
                    database: dbHealth,
                    redis: redisHealth,
                    discord: { healthy: discordStats.ready, guilds: discordStats.guilds },
                },
            });
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * Discord OAuth2 — exchange code for user info + JWT
     */
    app.post('/api/auth/discord', async (req, res) => {
        const { code, redirectUri } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Missing authorization code' });
        }

        try {
            // Exchange code for access token
            const tokenResponse = await axios.post(
                'https://discord.com/api/oauth2/token',
                new URLSearchParams({
                    client_id: config.discord.clientId,
                    client_secret: config.api.discordClientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri || `${config.api.dashboardUrl}/api/auth/callback/discord`,
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { access_token } = tokenResponse.data;

            // Get user info from Discord
            const userResponse = await axios.get('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${access_token}` },
            });

            const discordUser = userResponse.data;

            // Check admin access if BOT_ADMIN_IDS is configured
            if (config.discord.adminIds.length > 0) {
                if (!config.discord.adminIds.includes(discordUser.id)) {
                    return res.status(403).json({
                        error: 'Access denied',
                        message: 'You are not authorized to access the dashboard.',
                    });
                }
            }

            // Generate JWT
            const token = generateToken(discordUser);

            res.json({
                token,
                user: {
                    id: discordUser.id,
                    username: discordUser.username,
                    globalName: discordUser.global_name,
                    avatar: discordUser.avatar,
                    avatarUrl: discordUser.avatar
                        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                        : null,
                },
            });
        } catch (error) {
            logger.error('Discord OAuth error', { error: error.message });
            res.status(401).json({ error: 'Failed to authenticate with Discord' });
        }
    });

    // ─── Protected Routes (require JWT) ──────────────────

    /**
     * GET /api/stats — Bot statistics
     */
    app.get('/api/stats', requireAuth, async (req, res) => {
        try {
            const [counts, discordStats, schedulerStatus, notifCount] = await Promise.all([
                creators.getCounts(),
                discord.getStats(),
                scheduler.getStatus(),
                notificationLog.getCount(),
            ]);

            const youtubeStats = counts.find(c => c.platform === 'youtube') || { total: 0, live: 0 };
            const twitchStats = counts.find(c => c.platform === 'twitch') || { total: 0, live: 0 };

            res.json({
                creators: {
                    youtube: { total: parseInt(youtubeStats.total) || 0, live: parseInt(youtubeStats.live) || 0 },
                    twitch: { total: parseInt(twitchStats.total) || 0, live: parseInt(twitchStats.live) || 0 },
                },
                discord: discordStats,
                scheduler: schedulerStatus,
                notifications: { total: parseInt(notifCount) || 0 },
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/creators — List all creators with stream state
     */
    app.get('/api/creators', requireAuth, async (req, res) => {
        try {
            const [youtube, twitch] = await Promise.all([
                creators.getAllByPlatform('youtube'),
                creators.getAllByPlatform('twitch'),
            ]);

            res.json({
                creators: [...youtube, ...twitch].map(c => ({
                    id: c.id,
                    platform: c.platform,
                    externalId: c.external_id,
                    displayName: c.display_name,
                    iconUrl: c.icon_url,
                    isLive: c.is_live || false,
                    streamTitle: c.stream_title,
                    lastStreamId: c.last_stream_id,
                    startedAt: c.started_at,
                    lastCheckedAt: c.last_checked_at,
                    createdAt: c.created_at,
                })),
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/creators — Add a new creator
     */
    app.post('/api/creators', requireAuth, async (req, res) => {
        const { platform, externalId, displayName, iconUrl } = req.body;

        if (!platform || !externalId || !displayName) {
            return res.status(400).json({ error: 'Missing required fields: platform, externalId, displayName' });
        }

        if (!['youtube', 'twitch'].includes(platform)) {
            return res.status(400).json({ error: 'Platform must be "youtube" or "twitch"' });
        }

        try {
            const id = await creators.upsert(platform, externalId, displayName, iconUrl || null);
            // Ensure stream state exists
            await streamState.ensureExists(id);

            logger.info(`Dashboard: Added creator ${displayName} (${platform})`);
            res.status(201).json({ id, platform, externalId, displayName });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * DELETE /api/creators/:id — Remove a creator
     */
    app.delete('/api/creators/:id', requireAuth, async (req, res) => {
        try {
            const creator = await creators.getById(req.params.id);
            if (!creator) {
                return res.status(404).json({ error: 'Creator not found' });
            }

            await creators.delete(req.params.id);
            logger.info(`Dashboard: Removed creator ${creator.display_name}`);
            res.json({ success: true, deleted: creator.display_name });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/routing — List all routing rules
     */
    app.get('/api/routing', requireAuth, async (req, res) => {
        try {
            const { guildId } = req.query;

            let routes;
            if (guildId) {
                routes = await routing.getForGuild(guildId);
            } else {
                // Get all guilds' routing
                const client = discord.getClient();
                const guildIds = client ? [...client.guilds.cache.keys()] : [];
                const allRoutes = await Promise.all(guildIds.map(id => routing.getForGuild(id)));
                routes = allRoutes.flat();
            }

            // Resolve channel and role names from Discord client
            const client = discord.getClient();
            const enrichedRoutes = routes.map(route => {
                let channelName = route.channel_id;
                let mentionRoleName = route.mention_role_id || null;

                if (client) {
                    const guild = client.guilds.cache.get(route.guild_id);
                    if (guild) {
                        const channel = guild.channels.cache.get(route.channel_id);
                        if (channel) channelName = channel.name;

                        if (route.mention_role_id) {
                            if (route.mention_role_id === route.guild_id) {
                                mentionRoleName = '@everyone';
                            } else {
                                const role = guild.roles.cache.get(route.mention_role_id);
                                if (role) mentionRoleName = role.name;
                            }
                        }
                    }
                }

                return { ...route, channel_name: channelName, mention_role_name: mentionRoleName };
            });

            res.json({ routes: enrichedRoutes });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/routing — Add a routing rule
     */
    app.post('/api/routing', requireAuth, async (req, res) => {
        const { creatorId, guildId, channelId, mentionRoleId } = req.body;

        if (!creatorId || !guildId || !channelId) {
            return res.status(400).json({ error: 'Missing required fields: creatorId, guildId, channelId' });
        }

        try {
            const id = await routing.add(creatorId, guildId, channelId, mentionRoleId || null);
            logger.info(`Dashboard: Added routing rule for guild ${guildId}`);
            res.status(201).json({ id });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * DELETE /api/routing/:id — Remove a routing rule
     */
    app.delete('/api/routing/:id', requireAuth, async (req, res) => {
        try {
            await routing.delete(req.params.id);
            logger.info(`Dashboard: Removed routing rule ${req.params.id}`);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/guilds — List guilds the bot is in
     */
    app.get('/api/guilds', requireAuth, async (req, res) => {
        try {
            const client = discord.getClient();
            if (!client || !client.isReady()) {
                return res.status(503).json({ error: 'Discord client not ready' });
            }

            const guilds = client.guilds.cache.map(guild => ({
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL({ size: 64 }),
                memberCount: guild.memberCount,
            }));

            res.json({ guilds });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/guilds/:id/channels — List text channels in a guild
     */
    app.get('/api/guilds/:id/channels', requireAuth, async (req, res) => {
        try {
            const client = discord.getClient();
            if (!client || !client.isReady()) {
                return res.status(503).json({ error: 'Discord client not ready' });
            }

            const guild = client.guilds.cache.get(req.params.id);
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            const channels = guild.channels.cache
                .filter(ch => ch.isTextBased() && !ch.isThread())
                .map(ch => ({
                    id: ch.id,
                    name: ch.name,
                    type: ch.type,
                }));

            res.json({ channels });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/notifications — Recent notification logs
     */
    app.get('/api/notifications', requireAuth, async (req, res) => {
        try {
            const count = await notificationLog.getCount();
            res.json({ total: parseInt(count) || 0 });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ─── Error handler ───────────────────────────────────

    app.use((err, req, res, next) => {
        logger.error('API error', { error: err.message, path: req.path });
        res.status(500).json({ error: 'Internal server error' });
    });

    // ─── Start server ────────────────────────────────────

    return new Promise((resolve, reject) => {
        server = app.listen(port, () => {
            logger.info(`✅ Dashboard API server running on port ${port}`);
            resolve(server);
        });

        server.on('error', (error) => {
            logger.error('API server failed to start', { error: error.message });
            reject(error);
        });
    });
}

/**
 * Stop the API server
 */
export async function stopApiServer() {
    if (server) {
        return new Promise((resolve) => {
            server.close(() => {
                logger.info('✅ API server stopped');
                server = null;
                resolve();
            });
        });
    }
}

export default { startApiServer, stopApiServer };
