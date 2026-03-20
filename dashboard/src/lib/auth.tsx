'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { exchangeDiscordCode } from '@/lib/api';

interface User {
    id: string;
    username: string;
    globalName: string;
    avatar: string;
    avatarUrl: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: () => void;
    logout: () => void;
    handleCallback: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    isLoading: true,
    login: () => { },
    logout: () => { },
    handleCallback: async () => { },
});

export function useAuth() {
    return useContext(AuthContext);
}

const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '';
const REDIRECT_URI = typeof window !== 'undefined'
    ? `${window.location.origin}/auth/callback`
    : '';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Load saved session
        const savedToken = localStorage.getItem('dashboard_token');
        const savedUser = localStorage.getItem('dashboard_user');

        if (savedToken && savedUser) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
        }
        setIsLoading(false);
    }, []);

    const login = () => {
        const params = new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            scope: 'identify',
        });

        window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
    };

    const logout = () => {
        localStorage.removeItem('dashboard_token');
        localStorage.removeItem('dashboard_user');
        setToken(null);
        setUser(null);
    };

    const handleCallback = async (code: string) => {
        try {
            const result = await exchangeDiscordCode(code, REDIRECT_URI);
            setToken(result.token);
            setUser(result.user);
            localStorage.setItem('dashboard_token', result.token);
            localStorage.setItem('dashboard_user', JSON.stringify(result.user));
        } catch (error) {
            console.error('Auth error:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout, handleCallback }}>
            {children}
        </AuthContext.Provider>
    );
}
