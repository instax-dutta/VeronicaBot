'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { getCreators, addCreator, deleteCreator, type Creator } from '@/lib/api';

function timeAgo(dateStr: string | null) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export default function CreatorsPage() {
    const { token } = useAuth();
    const [creators, setCreators] = useState<Creator[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({ platform: 'youtube', externalId: '', displayName: '' });
    const [submitting, setSubmitting] = useState(false);

    async function fetchCreators() {
        if (!token) return;
        try {
            const data = await getCreators(token);
            setCreators(data.creators);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { fetchCreators(); }, [token]);

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!token) return;
        setSubmitting(true);
        try {
            await addCreator(token, form);
            setShowModal(false);
            setForm({ platform: 'youtube', externalId: '', displayName: '' });
            await fetchCreators();
        } catch (err) {
            alert(`Failed to add creator: ${err}`);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(id: string, name: string) {
        if (!token) return;
        if (!confirm(`Remove ${name}? This will also delete their routing rules.`)) return;
        try {
            await deleteCreator(token, id);
            await fetchCreators();
        } catch (err) {
            alert(`Failed to remove: ${err}`);
        }
    }

    const filtered = search
        ? creators.filter(c => c.displayName.toLowerCase().includes(search.toLowerCase()))
        : creators;

    if (loading) {
        return <div className="loading-spinner"><div className="spinner" /></div>;
    }

    return (
        <>
            {/* Stitch-style full-height card */}
            <div className="stitch-page-card">
                {/* Card header */}
                <div className="stitch-card-header">
                    <div>
                        <h2 className="stitch-card-title">
                            <span className="material-symbols-outlined" style={{ color: 'var(--neon-blue)' }}>group</span>
                            Manage Streamers
                        </h2>
                        <p className="stitch-card-subtitle">Configure tracked channels and notification settings</p>
                    </div>
                    <div className="stitch-card-actions">
                        <div className="stitch-search-wrap">
                            <span className="material-symbols-outlined stitch-search-icon">search</span>
                            <input
                                className="stitch-search-input"
                                placeholder="Search streamers..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <button className="stitch-btn-add" onClick={() => setShowModal(true)}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>add</span>
                            Add New Streamer
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="stitch-table-wrap">
                    {filtered.length === 0 ? (
                        <div className="empty-state" style={{ padding: '60px 24px' }}>
                            <span className="empty-state-icon">👥</span>
                            <h3>{search ? 'No matching creators' : 'No creators yet'}</h3>
                            <p>{search ? 'Try a different search' : 'Add a creator to start tracking their streams'}</p>
                        </div>
                    ) : (
                        <table className="stitch-table">
                            <thead>
                                <tr>
                                    <th className="stitch-th" style={{ paddingLeft: '24px' }}>Streamer</th>
                                    <th className="stitch-th">Platform</th>
                                    <th className="stitch-th">Last Seen</th>
                                    <th className="stitch-th">Status</th>
                                    <th className="stitch-th" style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence>
                                    {filtered.map((c, i) => (
                                        <motion.tr
                                            key={c.id}
                                            className="stitch-row"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            transition={{ delay: i * 0.03 }}
                                        >
                                            <td className="stitch-td" style={{ paddingLeft: '24px' }}>
                                                <div className="stitch-streamer-cell">
                                                    <div className="stitch-avatar-wrap">
                                                        <div className={`stitch-avatar ${c.platform}`}>
                                                            {c.iconUrl ? (
                                                                <img src={c.iconUrl} alt={c.displayName} />
                                                            ) : (
                                                                <span>{c.displayName[0]?.toUpperCase()}</span>
                                                            )}
                                                        </div>
                                                        <div className={`stitch-avatar-dot ${c.isLive ? 'live' : 'offline'}`} />
                                                    </div>
                                                    <div>
                                                        <div className="stitch-streamer-name">{c.displayName}</div>
                                                        <div className="stitch-streamer-id">ID: {c.externalId.slice(0, 8)}...</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="stitch-td">
                                                <div className="stitch-platform-cell">
                                                    <span className={`stitch-platform-dot ${c.platform}`} />
                                                    {c.platform === 'youtube' ? 'YouTube' : 'Twitch'}
                                                </div>
                                            </td>
                                            <td className="stitch-td stitch-muted">{timeAgo(c.lastCheckedAt)}</td>
                                            <td className="stitch-td">
                                                <span className={`stitch-status-badge ${c.isLive ? 'live' : 'offline'}`}>
                                                    {c.isLive ? 'Live' : 'Offline'}
                                                </span>
                                            </td>
                                            <td className="stitch-td" style={{ textAlign: 'right', paddingRight: '24px' }}>
                                                <div className="stitch-actions">
                                                    <button
                                                        className="stitch-action-btn delete"
                                                        onClick={() => handleDelete(c.id, c.displayName)}
                                                        title="Remove"
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                {filtered.length > 0 && (
                    <div className="stitch-table-footer">
                        Showing {filtered.length} of {creators.length} streamers
                    </div>
                )}
            </div>

            {/* Add Creator Modal */}
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
                            <h2>Add Creator</h2>
                            <form onSubmit={handleAdd}>
                                <div className="form-group">
                                    <label className="form-label">Platform</label>
                                    <select
                                        className="form-select"
                                        value={form.platform}
                                        onChange={e => setForm(prev => ({ ...prev, platform: e.target.value }))}
                                    >
                                        <option value="youtube">YouTube</option>
                                        <option value="twitch">Twitch</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">
                                        {form.platform === 'youtube' ? 'Channel ID' : 'Username'}
                                    </label>
                                    <input
                                        className="form-input"
                                        placeholder={form.platform === 'youtube' ? 'UCxxxxxx' : 'username'}
                                        value={form.externalId}
                                        onChange={e => setForm(prev => ({ ...prev, externalId: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Display Name</label>
                                    <input
                                        className="form-input"
                                        placeholder="Creator name"
                                        value={form.displayName}
                                        onChange={e => setForm(prev => ({ ...prev, displayName: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                                        {submitting ? 'Adding...' : 'Add Creator'}
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
