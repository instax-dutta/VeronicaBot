'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { getRouting, getGuilds, getGuildChannels, getCreators, addRoute, deleteRoute, type Route, type Guild, type Channel, type Creator } from '@/lib/api';

export default function RoutingPage() {
    const { token } = useAuth();
    const [routes, setRoutes] = useState<Route[]>([]);
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [creators, setCreators] = useState<Creator[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [search, setSearch] = useState('');

    const [selectedGuild, setSelectedGuild] = useState('');
    const [channels, setChannels] = useState<Channel[]>([]);
    const [form, setForm] = useState({ creatorId: '', guildId: '', channelId: '' });
    const [submitting, setSubmitting] = useState(false);

    async function fetchData() {
        if (!token) return;
        try {
            const [routeData, guildData, creatorData] = await Promise.all([
                getRouting(token),
                getGuilds(token),
                getCreators(token),
            ]);
            setRoutes(routeData.routes);
            setGuilds(guildData.guilds);
            setCreators(creatorData.creators);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { fetchData(); }, [token]);

    useEffect(() => {
        if (!selectedGuild || !token) return;
        async function fetch() {
            const data = await getGuildChannels(token!, selectedGuild);
            setChannels(data.channels);
        }
        fetch();
        setForm(prev => ({ ...prev, guildId: selectedGuild, channelId: '' }));
    }, [selectedGuild, token]);

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!token) return;
        setSubmitting(true);
        try {
            await addRoute(token, form);
            setShowModal(false);
            setForm({ creatorId: '', guildId: '', channelId: '' });
            setSelectedGuild('');
            await fetchData();
        } catch (err) {
            alert(`Failed to add route: ${err}`);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(id: string) {
        if (!token) return;
        if (!confirm('Remove this routing rule?')) return;
        try {
            await deleteRoute(token, id);
            await fetchData();
        } catch (err) {
            alert(`Failed to remove: ${err}`);
        }
    }

    const guildMap = Object.fromEntries(guilds.map(g => [g.id, g.name]));
    const creatorMap = Object.fromEntries(creators.map(c => [c.id, c]));

    const filtered = search
        ? routes.filter(r => r.display_name?.toLowerCase().includes(search.toLowerCase()) || r.channel_name?.toLowerCase().includes(search.toLowerCase()))
        : routes;

    if (loading) {
        return <div className="loading-spinner"><div className="spinner" /></div>;
    }

    return (
        <>
            <div className="stitch-page-card">
                <div className="stitch-card-header">
                    <div>
                        <h2 className="stitch-card-title">
                            <span className="material-symbols-outlined" style={{ color: 'var(--neon-blue)' }}>alt_route</span>
                            Notification Routing
                        </h2>
                        <p className="stitch-card-subtitle">Configure which channels receive notifications for each creator</p>
                    </div>
                    <div className="stitch-card-actions">
                        <div className="stitch-search-wrap">
                            <span className="material-symbols-outlined stitch-search-icon">search</span>
                            <input
                                className="stitch-search-input"
                                placeholder="Search routes..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <button className="stitch-btn-add" onClick={() => setShowModal(true)}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>add</span>
                            Add Route
                        </button>
                    </div>
                </div>

                <div className="stitch-table-wrap">
                    {filtered.length === 0 ? (
                        <div className="empty-state" style={{ padding: '60px 24px' }}>
                            <span className="empty-state-icon">📡</span>
                            <h3>{search ? 'No matching routes' : 'No routing rules yet'}</h3>
                            <p>{search ? 'Try a different search' : 'Add a route to start delivering notifications'}</p>
                        </div>
                    ) : (
                        <table className="stitch-table">
                            <thead>
                                <tr>
                                    <th className="stitch-th" style={{ paddingLeft: '24px' }}>Creator</th>
                                    <th className="stitch-th">Server</th>
                                    <th className="stitch-th">Channel</th>
                                    <th className="stitch-th">Mention Role</th>
                                    <th className="stitch-th" style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence>
                                    {filtered.map((route, i) => {
                                        const creator = creatorMap[route.creator_id];
                                        return (
                                            <motion.tr
                                                key={route.id}
                                                className="stitch-row"
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 10 }}
                                                transition={{ delay: i * 0.03 }}
                                            >
                                                <td className="stitch-td" style={{ paddingLeft: '24px' }}>
                                                    <div className="stitch-streamer-cell">
                                                        <div className={`stitch-avatar ${route.platform}`} style={{ width: '32px', height: '32px', fontSize: '0.7rem' }}>
                                                            {creator?.iconUrl ? (
                                                                <img src={creator.iconUrl} alt={route.display_name} />
                                                            ) : (
                                                                <span>{(route.display_name || '?')[0]?.toUpperCase()}</span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="stitch-streamer-name" style={{ fontSize: '0.85rem' }}>{route.display_name}</div>
                                                            <div className="stitch-streamer-id">{route.platform === 'youtube' ? 'YouTube' : 'Twitch'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="stitch-td">
                                                    <div className="stitch-platform-cell">
                                                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#5865F2' }}>dns</span>
                                                        {guildMap[route.guild_id] || route.guild_id}
                                                    </div>
                                                </td>
                                                <td className="stitch-td">
                                                    <span style={{ fontFamily: "'Geist Mono', monospace", color: 'var(--neon-blue)', fontSize: '0.8rem' }}>
                                                        #{route.channel_name || route.channel_id}
                                                    </span>
                                                </td>
                                                <td className="stitch-td stitch-muted">
                                                    {route.mention_role_name || route.mention_role_id || '—'}
                                                </td>
                                                <td className="stitch-td" style={{ textAlign: 'right', paddingRight: '24px' }}>
                                                    <div className="stitch-actions">
                                                        <button
                                                            className="stitch-action-btn delete"
                                                            onClick={() => handleDelete(route.id)}
                                                            title="Remove route"
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    )}
                </div>

                {filtered.length > 0 && (
                    <div className="stitch-table-footer">
                        {filtered.length} route{filtered.length !== 1 ? 's' : ''} configured
                    </div>
                )}
            </div>

            {/* Add Routing Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowModal(false)}
                    >
                        <motion.div
                            className="modal"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h2>Add Routing Rule</h2>
                            <form onSubmit={handleAdd}>
                                <div className="form-group">
                                    <label className="form-label">Creator</label>
                                    <select
                                        className="form-select"
                                        value={form.creatorId}
                                        onChange={e => setForm(prev => ({ ...prev, creatorId: e.target.value }))}
                                        required
                                    >
                                        <option value="">Select a creator</option>
                                        {creators.map(c => (
                                            <option key={c.id} value={c.id}>{c.displayName} ({c.platform})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Server</label>
                                    <select
                                        className="form-select"
                                        value={selectedGuild}
                                        onChange={e => setSelectedGuild(e.target.value)}
                                        required
                                    >
                                        <option value="">Select a server</option>
                                        {guilds.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                                {channels.length > 0 && (
                                    <div className="form-group">
                                        <label className="form-label">Channel</label>
                                        <select
                                            className="form-select"
                                            value={form.channelId}
                                            onChange={e => setForm(prev => ({ ...prev, channelId: e.target.value }))}
                                            required
                                        >
                                            <option value="">Select a channel</option>
                                            {channels.map(ch => (
                                                <option key={ch.id} value={ch.id}>#{ch.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                                        {submitting ? 'Adding...' : 'Add Route'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
