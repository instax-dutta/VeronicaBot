'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navGroups = [
    [
        { href: '/', label: 'Overview', icon: 'dashboard' },
        { href: '/monitoring', label: 'Monitoring', icon: 'monitoring' },
        { href: '/creators', label: 'Creators', icon: 'group' },
    ],
    [
        { href: '/routing', label: 'Routing', icon: 'alt_route' },
        { href: '/logs', label: 'Logs', icon: 'description' },
    ],
    [
        { href: '/settings', label: 'Settings', icon: 'settings' },
    ],
];

export default function DockNav() {
    const pathname = usePathname();

    return (
        <div className="dock-wrapper">
            <div className="dock-container">
                {navGroups.map((group, gi) => (
                    <span key={gi} style={{ display: 'contents' }}>
                        {gi > 0 && <div className="dock-divider" />}
                        {group.map((item) => {
                            const isActive = item.href === '/'
                                ? pathname === '/'
                                : pathname.startsWith(item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`dock-item ${isActive ? 'active' : ''}`}
                                >
                                    <div className="dock-icon-box">
                                        <span className="material-symbols-outlined" style={{ fontSize: '1.5rem' }}>
                                            {item.icon}
                                        </span>
                                    </div>
                                    <span className="dock-tooltip">{item.label}</span>
                                </Link>
                            );
                        })}
                    </span>
                ))}
            </div>
        </div>
    );
}
