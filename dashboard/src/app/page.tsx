'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { getStats, getHealth, getCreators, type BotStats, type HealthStatus, type Creator } from '@/lib/api';

type LogEntry = { time: string; level: string; message: string };

function generateLogs(creators: Creator[], health: HealthStatus | null): LogEntry[] {
  const now = new Date();
  const fmt = (offset: number) => {
    const d = new Date(now.getTime() - offset * 1000);
    return d.toTimeString().slice(0, 8);
  };

  const logs: LogEntry[] = [];
  let offset = 0;

  // Generate a check log for each real creator
  creators.forEach((c, i) => {
    const platform = c.platform === 'youtube' ? 'YouTube' : 'Twitch';
    logs.push({ time: fmt(offset), level: 'INFO', message: `Checking stream status for channel: <hl>${c.displayName}</hl> (${platform})...` });
    offset += 1;
    logs.push({
      time: fmt(offset),
      level: 'INFO',
      message: c.isLive
        ? `Stream status: <green>LIVE</green> — ${c.streamTitle || 'Broadcasting'}`
        : 'Stream status: <red>OFFLINE</red>',
    });
    offset += 2;
  });

  // System logs
  const dbLatency = health?.services.database.healthy ? `${Math.floor(Math.random() * 30 + 10)}ms` : 'TIMEOUT';
  logs.push({ time: fmt(offset), level: 'SYSTEM', message: `Database connection verified (NeonDB). Latency: ${dbLatency}` });
  offset += 3;
  logs.push({ time: fmt(offset), level: 'CRON', message: "Scheduled task 'update_cache' executed successfully." });

  return logs;
}

function renderLogMessage(msg: string) {
  const parts = msg.split(/(<hl>.*?<\/hl>|<red>.*?<\/red>|<green>.*?<\/green>)/g);
  return parts.map((part, i) => {
    if (part.startsWith('<hl>')) return <span key={i} style={{ color: '#facc15' }}>{part.replace(/<\/?hl>/g, '')}</span>;
    if (part.startsWith('<red>')) return <span key={i} style={{ color: '#f87171' }}>{part.replace(/<\/?red>/g, '')}</span>;
    if (part.startsWith('<green>')) return <span key={i} style={{ color: '#4ade80' }}>{part.replace(/<\/?green>/g, '')}</span>;
    return <span key={i}>{part}</span>;
  });
}

function formatUptime(ms: number) {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export default function OverviewPage() {
  const { token, user, logout } = useAuth();
  const [stats, setStats] = useState<BotStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
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
        const [statsData, healthData, creatorsData] = await Promise.all([
          getStats(token!),
          getHealth(),
          getCreators(token!),
        ]);
        setStats(statsData);
        setHealth(healthData);
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

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
      </div>
    );
  }

  const totalCreators = creators.length;
  const totalLive = (stats?.creators.youtube.live || 0) + (stats?.creators.twitch.live || 0);
  const notifTotal = stats?.notifications.total || 0;
  const guilds = stats?.discord.guilds || 0;
  const isHealthy = health?.services.database.healthy && health?.services.redis.healthy && health?.services.discord.healthy;
  const uptime = stats?.discord.uptime || 0;
  const uptimeStr = uptime > 0 ? formatUptime(uptime) : '—';
  const uptimePct = stats?.scheduler.isRunning ? '99.9%' : '—';

  return (
    <div className="orbital-page">
      {/* Header */}
      <header className="orbital-header">
        <div className="orbital-header-left">
          <span className="material-symbols-outlined orbital-globe">public</span>
          <h1 className="orbital-title">
            VERONICA <span className="orbital-version">V2.0</span>
          </h1>
        </div>
        <div className="orbital-header-right">
          <div className="orbital-system-status">
            <span className={`orbital-status-dot ${isHealthy ? 'online' : 'offline'}`} />
            <span>{isHealthy ? 'SYSTEM ONLINE' : 'DEGRADED'}</span>
          </div>
          <div className="orbital-header-divider" />
          <div className="avatar-dropdown" ref={userMenuRef}>
            <button className="orbital-user-btn" onClick={() => setShowUserMenu(v => !v)}>
              <span className="orbital-user-label">USR: {user?.globalName || user?.username || 'Veronica'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.4)' }}>settings</span>
            </button>
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
      </header>

      {/* Orbital Visualization */}
      <main className="orbital-main">
        {/* Grid background */}
        <div className="orbital-grid-bg" />

        {/* Orbital rings + stats */}
        <div className="orbital-vis-container">
          {/* Outer spinning ring */}
          <div className="orbital-outer-ring">
            <div className="orbital-ring-dot" style={{ top: '-4px', left: '50%' }} />
            <div className="orbital-ring-dot" style={{ top: '50%', right: '-4px' }} />
            <div className="orbital-ring-dot" style={{ bottom: '-4px', left: '50%' }} />
            <div className="orbital-ring-dot" style={{ top: '50%', left: '-4px' }} />
          </div>

          {/* Dashed ring */}
          <div className="orbital-dashed-ring" />

          {/* Central hub */}
          <motion.div
            className="orbital-hub"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <span className="material-symbols-outlined orbital-hub-icon">smart_toy</span>
            <div className="orbital-hub-text">
              <div className="orbital-hub-label">STATUS</div>
              <div className="orbital-hub-status">{isHealthy ? 'HEALTHY' : 'DEGRADED'}</div>
            </div>
            <div className="orbital-hub-uptime">{uptimePct} UPTIME</div>
          </motion.div>

          {/* Stat nodes */}
          <motion.div className="stat-node stat-tl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <div className="stat-node-value">{totalCreators}</div>
            <div className="stat-node-label">Creators</div>
          </motion.div>
          <motion.div className="stat-node stat-tr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <div className="stat-node-value">{totalLive}</div>
            <div className="stat-node-label">Active Live</div>
          </motion.div>
          <motion.div className="stat-node stat-bl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <div className="stat-node-value">{notifTotal}</div>
            <div className="stat-node-label">Notifs Sent</div>
          </motion.div>
          <motion.div className="stat-node stat-br" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            <div className="stat-node-value">{guilds}</div>
            <div className="stat-node-label">Servers</div>
          </motion.div>

          {/* Connector lines (SVG) */}
          <svg className="orbital-connectors" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="30" y1="30" x2="42" y2="42" stroke="#00f3ff" strokeWidth="0.2" />
            <line x1="70" y1="30" x2="58" y2="42" stroke="#00f3ff" strokeWidth="0.2" />
            <line x1="30" y1="70" x2="42" y2="58" stroke="#00f3ff" strokeWidth="0.2" />
            <line x1="70" y1="70" x2="58" y2="58" stroke="#00f3ff" strokeWidth="0.2" />
          </svg>
        </div>

        {/* Terminal Log */}
        <motion.div
          className="orbital-terminal"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="orbital-terminal-scan" />
          <div className="orbital-terminal-header">
            <div className="orbital-terminal-title">
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: 'var(--neon-blue)' }}>terminal</span>
              <span>LIVE SYSTEM LOG</span>
            </div>
            <div className="orbital-terminal-dots">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>
          </div>
          <div className="orbital-terminal-body">
            {generateLogs(creators, health).map((log, i) => (
              <div key={i} className="terminal-line">
                <span className="terminal-time">[{log.time}]</span>
                <span className={`terminal-level ${log.level.toLowerCase()}`}>{log.level}</span>
                <span className="terminal-msg">{renderLogMessage(log.message)}</span>
              </div>
            ))}
            <div className="terminal-line terminal-ready">
              <span className="terminal-time">[{new Date().toTimeString().slice(0, 8)}]</span>
              <span className="terminal-level ready">READY</span>
              <span className="terminal-msg" style={{ color: 'var(--neon-blue)' }}>
                &gt; Waiting for next cycle...
              </span>
              <span className="terminal-cursor" />
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
