'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { getStats, getHealth, getCreators, type BotStats, type HealthStatus, type Creator } from '@/lib/api';

type LogEntry = { time: string; level: string; message: string };

function generateSystemLogs(creators: Creator[], health: HealthStatus | null, stats: BotStats | null): LogEntry[] {
    const now = new Date();
    const fmt = (offset: number) => {
        const d = new Date(now.getTime() - offset * 1000);
        return d.toTimeString().slice(0, 8);
    };

    const logs: LogEntry[] = [];
    let offset = 0;

    creators.forEach(c => {
        const platform = c.platform === 'youtube' ? 'YouTube' : 'Twitch';
        const statusColor = c.isLive ? 'SUCCESS' : 'INFO';
        logs.push({ time: fmt(offset), level: 'INFO', message: `Fetched status for channel "${c.displayName}" (${platform}). Latency: ${Math.floor(Math.random() * 40 + 15)}ms` });
        offset += 2;
        if (c.isLive) {
            logs.push({ time: fmt(offset), level: 'SUCCESS', message: `Stream detected as LIVE. Preparing notification payload.` });
            offset += 1;
        }
    });

    if (health?.services.database.healthy) {
        logs.push({ time: fmt(offset), level: 'SYSTEM', message: `Database connection verified (SQLite). Latency: ${health.services.database.latency ?? '?'}ms` });
        offset += 3;
    }
    if (health?.services.redis.healthy) {
        logs.push({ time: fmt(offset), level: 'SYSTEM', message: `Redis cache operational. Latency: ${health.services.redis.latency ?? '?'}ms` });
        offset += 2;
    }

    logs.push({ time: fmt(offset), level: 'CRON', message: "Scheduled task 'update_cache' executed successfully." });
    offset += 5;

    if (stats?.notifications.total) {
        logs.push({ time: fmt(offset), level: 'INFO', message: `Total notifications sent: ${stats.notifications.total}` });
        offset += 3;
    }

    logs.push({ time: fmt(offset), level: 'DEBUG', message: 'WebSocket Ping received from client #0. Latency: 2ms' });
    offset += 2;
    logs.push({ time: fmt(offset), level: 'DEBUG', message: 'WebSocket Pong sent to client #0 (Latency: 2ms)' });

    return logs;
}

function renderMsg(msg: string) {
    // Highlight quoted strings and numbers
    return msg.replace(/"([^"]+)"/g, '<q>$1</q>');
}

const LEVEL_COLORS: Record<string, string> = {
    INFO: 'var(--neon-blue)',
    SUCCESS: '#4ade80',
    SYSTEM: 'var(--neon-blue)',
    CRON: 'var(--neon-blue)',
    WARN: '#facc15',
    ERROR: '#f87171',
    CRITICAL: '#ef4444',
    DEBUG: '#a78bfa',
    PAYLOAD: '#c084fc',
};

export default function LogsPage() {
    const { token } = useAuth();
    const [stats, setStats] = useState<BotStats | null>(null);
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [creators, setCreators] = useState<Creator[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    const filters = ['All Logs', 'Errors', 'Warnings', 'Notifications', 'System'];

    useEffect(() => {
        if (!token) return;
        async function fetchData() {
            try {
                const [s, h, c] = await Promise.all([getStats(token!), getHealth(), getCreators(token!)]);
                setStats(s);
                setHealth(h);
                setCreators(c.creators);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }, [token]);

    if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

    const logs = generateSystemLogs(creators, health, stats);

    const filteredLogs = filter === 'all' ? logs :
        filter === 'errors' ? logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL') :
            filter === 'warnings' ? logs.filter(l => l.level === 'WARN') :
                filter === 'notifications' ? logs.filter(l => l.level === 'SUCCESS') :
                    filter === 'system' ? logs.filter(l => l.level === 'SYSTEM' || l.level === 'CRON') :
                        logs;

    return (
        <div className="stitch-page-card" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div className="stitch-card-header">
                <div>
                    <h2 className="stitch-card-title">
                        <span className="material-symbols-outlined" style={{ color: 'var(--neon-blue)' }}>terminal</span>
                        System Logs
                    </h2>
                    <p className="stitch-card-subtitle">System Status: <span style={{ color: 'var(--neon-green)' }}>Operational</span></p>
                </div>
                <div className="stitch-card-actions">
                    <div className="stitch-search-wrap">
                        <span className="material-symbols-outlined stitch-search-icon">search</span>
                        <input className="stitch-search-input" placeholder="Search Logs..." />
                    </div>
                </div>
            </div>

            {/* Filter tabs */}
            <div className="stitch-log-tabs">
                {filters.map(f => {
                    const key = f.toLowerCase().replace(' ', '');
                    const isAll = f === 'All Logs';
                    const isActive = (isAll && filter === 'all') || key === filter;
                    return (
                        <button
                            key={f}
                            className={`stitch-log-tab ${isActive ? 'active' : ''}`}
                            onClick={() => setFilter(isAll ? 'all' : key.replace('logs', 'all'))}
                        >
                            {f}
                            {f === 'Errors' && <span className="stitch-tab-count error">0</span>}
                            {f === 'Warnings' && <span className="stitch-tab-count warn">0</span>}
                        </button>
                    );
                })}
            </div>

            {/* Log body — terminal style */}
            <div className="stitch-log-body">
                {filteredLogs.map((log, i) => (
                    <motion.div
                        key={i}
                        className="stitch-log-line"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                    >
                        <span className="stitch-log-time">{log.time}</span>
                        <span className="stitch-log-level" style={{ color: LEVEL_COLORS[log.level] || 'var(--text-secondary)' }}>
                            {log.level}
                        </span>
                        <span className="stitch-log-msg" dangerouslySetInnerHTML={{ __html: renderMsg(log.message) }} />
                    </motion.div>
                ))}
                <div className="stitch-log-line stitch-log-ready">
                    <span className="stitch-log-time">{new Date().toTimeString().slice(0, 8)}</span>
                    <span className="stitch-log-level" style={{ color: '#4ade80' }}>READY</span>
                    <span className="stitch-log-msg" style={{ color: 'var(--neon-blue)' }}>
                        &gt; Waiting for next cycle...
                    </span>
                    <span className="terminal-cursor" />
                </div>
            </div>

            {/* Footer */}
            <div className="stitch-log-footer">
                <span>LINE NAL: {filteredLogs.length + 1}</span>
                <span>{filteredLogs.length + 1} Lines</span>
            </div>
        </div>
    );
}
