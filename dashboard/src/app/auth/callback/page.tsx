'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';

function CallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { handleCallback } = useAuth();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');

        if (errorParam) {
            setError('Discord authorization was denied.');
            return;
        }

        if (!code) {
            setError('Missing authorization code.');
            return;
        }

        handleCallback(code)
            .then(() => {
                router.push('/');
            })
            .catch((err) => {
                setError(err.message || 'Authentication failed');
            });
    }, [searchParams, handleCallback, router]);

    if (error) {
        return (
            <div className="login-page">
                <div className="login-card">
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>❌</div>
                    <h1>Authentication Failed</h1>
                    <p>{error}</p>
                    <button className="login-btn" onClick={() => router.push('/')}>
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="loading-spinner" style={{ padding: '24px' }}>
                    <div className="spinner" />
                </div>
                <p>Authenticating with Discord...</p>
            </div>
        </div>
    );
}

export default function AuthCallbackPage() {
    return (
        <Suspense fallback={
            <div className="login-page">
                <div className="login-card">
                    <div className="loading-spinner" style={{ padding: '24px' }}>
                        <div className="spinner" />
                    </div>
                    <p>Loading...</p>
                </div>
            </div>
        }>
            <CallbackContent />
        </Suspense>
    );
}
