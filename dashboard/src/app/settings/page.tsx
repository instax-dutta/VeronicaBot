'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { getStats, getHealth, type BotStats, type HealthStatus } from '@/lib/api';

function formatUptime(ms: number) {
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

export default function SettingsPage() {
    const { token } = useAuth();
    const [stats, setStats] = useState<BotStats | null>(null);
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        async function fetch() {
            try {
                const [s, h] = await Promise.all([getStats(token!), getHealth()]);
                setStats(s);
                setHealth(h);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetch();
    }, [token]);

    if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

    const isHealthy = health?.services.database.healthy && health?.services.redis.healthy && health?.services.discord.healthy;

    return (
        <div className="stitch-page-card">
            <div className="stitch-card-header">
                <div>
                    <h2 className="stitch-card-title">
                        <span className="material-symbols-outlined" style={{ color: 'var(--neon-blue)' }}>settings</span>
                        System Settings
                    </h2>
                    <p className="stitch-card-subtitle">Bot configuration and system information (read-only)</p>
                </div>
                <div className="stitch-card-actions">
                    <div style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: isHealthy ? 'rgba(10, 255, 96, 0.3)' : 'rgba(255, 42, 109, 0.3)',
                        color: isHealthy ? 'var(--neon-green)' : 'var(--neon-red)',
                        background: isHealthy ? 'rgba(10, 255, 96, 0.06)' : 'rgba(255, 42, 109, 0.06)',
                    }}>
                        {isHealthy ? 'All Systems Operational' : 'Service Degraded'}
                    </div>
                </div>
            </div>

            <div className="stitch-settings-grid">
                {/* Bot Info */}
                <motion.div
                    className="stitch-setting-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="stitch-setting-title">
                        <span className="material-symbols-outlined" style={{ color: 'var(--neon-blue)', fontSize: '1.2rem' }}>smart_toy</span>
                        Bot Info
                    </div>
                    <p className="stitch-setting-desc">Core bot configuration</p>
                    <div className="stitch-setting-rows">
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">Bot Name</span>
                            <span className="stitch-setting-val">{stats?.discord.botName || 'Veronica'}</span>
                        </div>
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">Servers</span>
                            <span className="stitch-setting-val">{stats?.discord.guilds || 0}</span>
                        </div>
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">Uptime</span>
                            <span className="stitch-setting-val" style={{ color: 'var(--neon-green)' }}>{formatUptime(stats?.discord.uptime || 0)}</span>
                        </div>
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">Scheduler</span>
                            <span className="stitch-setting-val" style={{ color: stats?.scheduler.isRunning ? 'var(--neon-green)' : 'var(--neon-red)' }}>
                                {stats?.scheduler.isRunning ? 'Running' : 'Stopped'}
                            </span>
                        </div>
                    </div>
                </motion.div>

                {/* Services */}
                <motion.div
                    className="stitch-setting-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                >
                    <div className="stitch-setting-title">
                        <span className="material-symbols-outlined" style={{ color: 'var(--neon-green)', fontSize: '1.2rem' }}>ecg_heart</span>
                        Services
                    </div>
                    <p className="stitch-setting-desc">Connection status for all services</p>
                    <div className="stitch-setting-rows">
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">
                                <span className={`stitch-inline-dot ${health?.services.database.healthy ? 'healthy' : 'unhealthy'}`} />
                                Database (NeonDB)
                            </span>
                            <span className="stitch-setting-val" style={{ color: health?.services.database.healthy ? 'var(--neon-green)' : 'var(--neon-red)' }}>
                                {health?.services.database.healthy ? `Connected (${health.services.database.latency ?? '?'}ms)` : 'Disconnected'}
                            </span>
                        </div>
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">
                                <span className={`stitch-inline-dot ${health?.services.redis.healthy ? 'healthy' : 'unhealthy'}`} />
                                Redis Cache
                            </span>
                            <span className="stitch-setting-val" style={{ color: health?.services.redis.healthy ? 'var(--neon-green)' : 'var(--neon-red)' }}>
                                {health?.services.redis.healthy ? `Connected (${health.services.redis.latency ?? '?'}ms)` : 'Disconnected'}
                            </span>
                        </div>
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">
                                <span className={`stitch-inline-dot ${health?.services.discord.healthy ? 'healthy' : 'unhealthy'}`} />
                                Discord Gateway
                            </span>
                            <span className="stitch-setting-val" style={{ color: health?.services.discord.healthy ? 'var(--neon-green)' : 'var(--neon-red)' }}>
                                {health?.services.discord.healthy ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                    </div>
                </motion.div>

                {/* Creators */}
                <motion.div
                    className="stitch-setting-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.16 }}
                >
                    <div className="stitch-setting-title">
                        <span className="material-symbols-outlined" style={{ color: 'var(--neon-purple)', fontSize: '1.2rem' }}>group</span>
                        Creator Stats
                    </div>
                    <p className="stitch-setting-desc">Tracked creators overview</p>
                    <div className="stitch-setting-rows">
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">YouTube Tracked</span>
                            <span className="stitch-setting-val">{stats?.creators.youtube.total || 0}</span>
                        </div>
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">Twitch Tracked</span>
                            <span className="stitch-setting-val">{stats?.creators.twitch.total || 0}</span>
                        </div>
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">YouTube Live</span>
                            <span className="stitch-setting-val" style={{ color: (stats?.creators.youtube.live || 0) > 0 ? '#4ade80' : 'var(--text-muted)' }}>
                                {stats?.creators.youtube.live || 0}
                            </span>
                        </div>
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">Twitch Live</span>
                            <span className="stitch-setting-val" style={{ color: (stats?.creators.twitch.live || 0) > 0 ? '#4ade80' : 'var(--text-muted)' }}>
                                {stats?.creators.twitch.live || 0}
                            </span>
                        </div>
                    </div>
                </motion.div>

                {/* Notifications */}
                <motion.div
                    className="stitch-setting-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.24 }}
                >
                    <div className="stitch-setting-title">
                        <span className="material-symbols-outlined" style={{ color: '#facc15', fontSize: '1.2rem' }}>notifications</span>
                        Notifications
                    </div>
                    <p className="stitch-setting-desc">Notification delivery stats</p>
                    <div className="stitch-setting-rows">
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">Total Sent</span>
                            <span className="stitch-setting-val">{(stats?.notifications.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="stitch-setting-row">
                            <span className="stitch-setting-label">Version</span>
                            <span className="stitch-setting-val" style={{ color: 'var(--text-muted)' }}>v2.4.0</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
