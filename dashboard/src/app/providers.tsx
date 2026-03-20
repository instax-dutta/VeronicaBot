'use client';

import { AuthProvider, useAuth } from '@/lib/auth';
import DockNav from '@/components/DockNav';
import { usePathname } from 'next/navigation';

function AuthGate({ children }: { children: React.ReactNode }) {
    const { user, isLoading, login } = useAuth();
    const pathname = usePathname();

    // Allow auth callback page through
    if (pathname.startsWith('/auth/')) {
        return <>{children}</>;
    }

    if (isLoading) {
        return (
            <div className="login-page">
                <div className="loading-spinner">
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="login-page">
                <div className="login-card">
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔔</div>
                    <h1>Veronica Dashboard</h1>
                    <p>Sign in with Discord to manage your bot</p>
                    <button className="login-btn" onClick={login}>
                        <svg width="20" height="20" viewBox="0 0 71 55" fill="white">
                            <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.7 40.7 0 00-1.8 3.7 54 54 0 00-16.2 0A38 38 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1A59.7 59.7 0 00.4 43.3a.2.2 0 000 .2A58.8 58.8 0 0018.1 54a.2.2 0 00.2-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 01 0-.4 30 30 0 001.1-.9.2.2 0 01.2 0A42 42 0 0053 44.7a.2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.6 43.5a.2.2 0 000-.2 59.2 59.2 0 00-10-38.3.2.2 0 00-.1-.1zM23.7 35.6c-3.3 0-6-3-6-6.8s2.7-6.8 6-6.8 6.1 3.1 6 6.8c0 3.7-2.6 6.8-6 6.8zm22.2 0c-3.3 0-6-3-6-6.8s2.6-6.8 6-6.8c3.4 0 6.1 3.1 6 6.8 0 3.7-2.6 6.8-6 6.8z" />
                        </svg>
                        Continue with Discord
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-layout">
            {/* Ambient background effects */}
            <div className="ambient-bg">
                <div className="ambient-grid" />
                <div className="ambient-glow-tl" />
                <div className="ambient-glow-br" />
            </div>

            <main className="main-content">{children}</main>
            <DockNav />
        </div>
    );
}

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <AuthGate>{children}</AuthGate>
        </AuthProvider>
    );
}
