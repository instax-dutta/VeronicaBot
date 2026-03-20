'use client';

import { motion } from 'framer-motion';

interface StatsCardProps {
    title: string;
    value: string | number;
    icon: string;
    subtitle?: string;
    trend?: 'up' | 'down' | 'neutral';
    accent?: string;
}

export default function StatsCard({ title, value, icon, subtitle, accent = 'var(--accent-blue)' }: StatsCardProps) {
    return (
        <motion.div
            className="stats-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{ '--card-accent': accent } as React.CSSProperties}
        >
            <div className="stats-card-header">
                <span className="stats-icon">{icon}</span>
                <span className="stats-title">{title}</span>
            </div>
            <div className="stats-value">{value}</div>
            {subtitle && <div className="stats-subtitle">{subtitle}</div>}
            <div className="stats-card-glow" />
        </motion.div>
    );
}
