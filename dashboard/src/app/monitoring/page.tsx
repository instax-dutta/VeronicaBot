'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { getStats, getHealth, getCreators, type BotStats, type HealthStatus, type Creator } from '@/lib/api';

function formatUptime(ms: number) {
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function getInitials(name: string) {
    return name.split(/[\s_-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const PLATFORM_COLORS: Record<string, string> = {
    twitch: '#9146ff',
    youtube: '#ef4444',
};

const MOCK_LOGS = [
    { time: '10:42:01', level: 'info' as const, message: 'Fetched stream status for all creators' },
    { time: '10:41:55', level: 'success' as const, message: 'Notification sent to #general' },
    { time: '10:40:12', level: 'info' as const, message: 'Cron job "check_streams" executed' },
    { time: '10:38:05', level: 'warn' as const, message: 'Rate limit approaching for Twitch API' },
    { time: '10:35:00', level: 'info' as const, message: 'Database backup completed' },
    { time: '10:32:14', level: 'info' as const, message: 'User config updated: route added' },
];

const fadeUp = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
};

export default function MonitoringPage() {
    const { token, user, logout } = useAuth();
    const [stats, setStats] = useState<BotStats | null>(null);
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [creators, setCreators] = useState<Creator[]>([]);
    const [loading, setLoading] = useState(true);
    const [ping, setPing] = useState<number | null>(null);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
                setShowUserMenu(false);
            }
        }
        if (showUserMenu) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showUserMenu]);

    useEffect(() => {
        if (!token) return;
        async function fetchData() {
            try {
                const [statsData, creatorsData] = await Promise.all([
                    getStats(token!),
                    getCreators(token!),
                ]);
                setStats(statsData);
                setCreators(creatorsData.creators);
            } catch (err) {
                console.error('Failed to fetch data:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [token]);

    // Realtime health ping — runs every 5 seconds
    useEffect(() => {
        async function pingHealth() {
            try {
                const t0 = performance.now();
                const healthData = await getHealth();
                const apiLatency = Math.round(performance.now() - t0);
                setPing(apiLatency); // used for Discord (no server-side latency)
                setHealth(healthData);
            } catch {
                setPing(null);
            }
        }
        pingHealth();
        const interval = setInterval(pingHealth, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="loading-spinner">
                <div className="spinner" />
            </div>
        );
    }

    const liveCreators = creators.filter(c => c.isLive);
    const totalLive = (stats?.creators.youtube.live || 0) + (stats?.creators.twitch.live || 0);
    const totalCreators = creators.length;
    const uptime = stats?.discord.uptime || 0;
    const uptimeStr = formatUptime(uptime);
    const notifTotal = stats?.notifications.total || 0;
    const isHealthy = health?.services.database.healthy && health?.services.redis.healthy && health?.services.discord.healthy;

    return (
        <>
            {/* Header */}
            <motion.header className="dashboard-header" {...fadeUp}>
                <div>
                    <h1 className="header-brand">
                        <span className="material-symbols-outlined brand-icon">smart_toy</span>
                        VERONICA
                        <span className="header-version">v2.4.0</span>
                    </h1>
                    <p className="header-status">
                        System Status:{' '}
                        <span className={isHealthy ? 'status-ok' : ''}>
                            {isHealthy ? 'Operational' : 'Degraded'}
                        </span>
                    </p>
                </div>
                <div className="header-actions">
                    <div className="ws-badge">
                        <span className="ws-dot" />
                        {stats?.discord.ready ? 'Connected' : 'Disconnected'}
                    </div>
                    <div className="avatar-dropdown" ref={userMenuRef}>
                        <div className="header-avatar" onClick={() => setShowUserMenu(v => !v)}>
                            {user?.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.username} />
                            ) : (
                                <span className="material-symbols-outlined">person</span>
                            )}
                        </div>
                        <AnimatePresence>
                            {showUserMenu && (
                                <motion.div
                                    className="avatar-menu"
                                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <div className="avatar-menu-user">
                                        <span className="avatar-menu-name">{user?.globalName || user?.username}</span>
                                        <span className="avatar-menu-sub">Discord</span>
                                    </div>
                                    <div className="avatar-menu-divider" />
                                    <button className="avatar-menu-item logout" onClick={logout}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>logout</span>
                                        Sign out
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.header>

            {/* Widget Grid */}
            <div className="widget-grid">
                {/* LIVE NOW */}
                <motion.div
                    className="widget-card"
                    style={{ gridColumn: 'span 4', gridRow: 'span 2' }}
                    {...fadeUp}
                    transition={{ delay: 0.05 }}
                >
                    <div className="widget-header">
                        <h2>
                            <span className="material-symbols-outlined" style={{ color: 'var(--neon-red)', animation: 'pulse-dot 2s infinite' }}>
                                radio_button_checked
                            </span>
                            LIVE NOW
                        </h2>
                        <span className="header-badge">
                            Monitoring {totalCreators} Source{totalCreators !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        <div className="scanline-overlay" />
                        {liveCreators.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px 24px' }}>
                                <span className="empty-state-icon">📡</span>
                                <h3>No one is live right now</h3>
                                <p>Streams will appear here when creators go live</p>
                            </div>
                        ) : (
                            <div className="stream-thumbnails" style={{ position: 'relative', zIndex: 1 }}>
                                {liveCreators.map(creator => (
                                    <div key={creator.id} className="stream-thumb">
                                        {creator.iconUrl ? (
                                            <img src={creator.iconUrl} alt={creator.displayName} />
                                        ) : (
                                            <div style={{
                                                width: '100%', height: '100%',
                                                background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem',
                                            }}>
                                                {creator.platform === 'youtube' ? '📺' : '🎮'}
                                            </div>
                                        )}
                                        <span className="live-tag">Live</span>
                                        <div className="stream-thumb-info">
                                            <p>{creator.streamTitle || 'Broadcasting Live'}</p>
                                            <div className="stream-thumb-meta">
                                                <span className={`platform-dot ${creator.platform}`} />
                                                {creator.displayName} • {creator.platform === 'youtube' ? 'YouTube' : 'Twitch'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* System Health */}
                <motion.div className="widget-card" style={{ gridColumn: 'span 2', padding: '20px' }} {...fadeUp} transition={{ delay: 0.1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <h3 className="widget-title">System Health</h3>
                        <span className="material-symbols-outlined" style={{ color: 'var(--neon-green)' }}>ecg_heart</span>
                    </div>
                    <div className="health-list">
                        <div className="health-row">
                            <div className="health-row-left">
                                <div className={`health-dot-neo ${health?.services.discord.healthy ? 'healthy' : 'unhealthy'}`} />
                                <span className="health-label">Discord API</span>
                            </div>
                            {(() => {
                                const ms = ping; const cls = !health?.services.discord.healthy ? 'bad' : ms && ms < 100 ? 'good' : ms && ms < 300 ? 'warn' : 'bad'; return (
                                    <span className={`health-latency ${cls}`}>{health?.services.discord.healthy ? `${ms ?? '—'}ms` : 'Down'}</span>
                                );
                            })()}
                        </div>
                        <div className="health-row">
                            <div className="health-row-left">
                                <div className={`health-dot-neo ${health?.services.database.healthy ? 'healthy' : 'unhealthy'}`} />
                                <span className="health-label">Database</span>
                            </div>
                            {(() => {
                                const ms = health?.services.database.latency; const cls = !health?.services.database.healthy ? 'bad' : ms != null && ms < 100 ? 'good' : ms != null && ms < 300 ? 'warn' : 'bad'; return (
                                    <span className={`health-latency ${cls}`}>{health?.services.database.healthy ? `${ms ?? '—'}ms` : 'Down'}</span>
                                );
                            })()}
                        </div>
                        <div className="health-row">
                            <div className="health-row-left">
                                <div className={`health-dot-neo ${health?.services.redis.healthy ? 'healthy' : 'unhealthy'}`} />
                                <span className="health-label">Redis Cache</span>
                            </div>
                            {(() => {
                                const ms = health?.services.redis.latency; const cls = !health?.services.redis.healthy ? 'bad' : ms != null && ms < 100 ? 'good' : ms != null && ms < 300 ? 'warn' : 'bad'; return (
                                    <span className={`health-latency ${cls}`}>{health?.services.redis.healthy ? `${ms ?? '—'}ms` : 'Down'}</span>
                                );
                            })()}
                        </div>
                    </div>
                </motion.div>

                {/* Notifications */}
                <motion.div className="widget-card" style={{ gridColumn: 'span 1' }} {...fadeUp} transition={{ delay: 0.15 }}>
                    <div className="stat-mini">
                        <div>
                            <h3 className="widget-title">Notifications</h3>
                            <p className="stat-mini-sub">All-time sent</p>
                        </div>
                        <div className="stat-mini-footer">
                            <div className="stat-mini-value glow-purple">{notifTotal.toLocaleString()}</div>
                            <div className="mini-bars">
                                <div className="mini-bar" style={{ height: '30%' }} />
                                <div className="mini-bar" style={{ height: '60%' }} />
                                <div className="mini-bar" style={{ height: '45%' }} />
                                <div className="mini-bar" style={{ height: '80%' }} />
                                <div className="mini-bar" style={{ height: '100%' }} />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Bot Uptime */}
                <motion.div className="widget-card" style={{ gridColumn: 'span 1' }} {...fadeUp} transition={{ delay: 0.2 }}>
                    <div className="stat-mini">
                        <div>
                            <h3 className="widget-title">Bot Uptime</h3>
                            <p className="stat-mini-sub">Since last restart</p>
                        </div>
                        <div className="stat-mini-footer">
                            <div>
                                <div className="stat-mini-value glow-blue" style={{ fontSize: '1.75rem' }}>{uptimeStr}</div>
                                <div className="uptime-reliability">{stats?.scheduler.isRunning ? '99.9% reliability' : 'Scheduler stopped'}</div>
                            </div>
                            <span className="material-symbols-outlined stat-mini-icon">timer</span>
                        </div>
                    </div>
                </motion.div>

                {/* System Logs */}
                <motion.div
                    className="widget-card"
                    style={{ gridColumn: 'span 3', gridRow: 'span 2', display: 'flex', flexDirection: 'column' }}
                    {...fadeUp}
                    transition={{ delay: 0.25 }}
                >
                    <div className="widget-header">
                        <h3 className="widget-title">System Logs</h3>
                        <button className="btn-neon">View All</button>
                    </div>
                    <div className="logs-table-wrap">
                        <table className="logs-table">
                            <tbody>
                                {MOCK_LOGS.map((log, i) => (
                                    <tr key={i}>
                                        <td className="log-time">{log.time}</td>
                                        <td className={`log-level ${log.level}`}>{log.level}</td>
                                        <td className="log-message">{log.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                {/* Top Creators */}
                <motion.div
                    className="widget-card"
                    style={{ gridColumn: 'span 3', gridRow: 'span 2', display: 'flex', flexDirection: 'column', padding: '20px' }}
                    {...fadeUp}
                    transition={{ delay: 0.3 }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 className="widget-title">Top Creators</h3>
                        <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>leaderboard</span>
                    </div>
                    <div className="creators-list">
                        {creators.length === 0 ? (
                            <div className="empty-state" style={{ padding: '32px 16px' }}>
                                <span className="empty-state-icon">👥</span>
                                <h3>No creators yet</h3>
                                <p>Add creators from the Creators page</p>
                            </div>
                        ) : (
                            creators.slice(0, 6).map(creator => (
                                <div key={creator.id} className="creator-row">
                                    <div className="creator-row-left">
                                        <div className="creator-avatar-circle" style={{ background: PLATFORM_COLORS[creator.platform] || '#6366f1' }}>
                                            {creator.iconUrl ? (
                                                <img src={creator.iconUrl} alt={creator.displayName} />
                                            ) : (
                                                getInitials(creator.displayName)
                                            )}
                                        </div>
                                        <div>
                                            <div className="creator-row-name">{creator.displayName}</div>
                                            <div className="creator-row-platform">
                                                {creator.platform === 'youtube' ? 'YouTube' : 'Twitch'}
                                                {creator.isLive && ' • 🔴 Live'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="creator-row-right">
                                        <div className={`creator-row-stat ${creator.platform}`}>{creator.isLive ? 'Live' : 'Offline'}</div>
                                        <div className="creator-row-stat-label">Status</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </div>
        </>
    );
}
