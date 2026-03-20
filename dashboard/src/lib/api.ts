// API client for communicating with the bot's REST API

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function handleTokenExpired() {
    if (typeof window !== 'undefined') {
        localStorage.removeItem('dashboard_token');
        localStorage.removeItem('dashboard_user');
        window.location.href = '/';
    }
}

interface FetchOptions extends RequestInit {
    token?: string;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const { token, ...fetchOptions } = options;

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    if (token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        const message = error.error || `API error: ${res.status}`;

        if (res.status === 401 || message.toLowerCase().includes('token expired')) {
            handleTokenExpired();
            throw new Error('Session expired. Redirecting to login...');
        }

        throw new Error(message);
    }

    return res.json();
}

// ─── Stats ───────────────────────────────────────────

export interface BotStats {
    creators: {
        youtube: { total: number; live: number };
        twitch: { total: number; live: number };
    };
    discord: {
        guilds: number;
        channels: number;
        ready: boolean;
        uptime: number;
        botName: string;
    };
    scheduler: {
        isRunning: boolean;
        uptime: number;
    };
    notifications: { total: number };
}

export function getStats(token: string) {
    return apiFetch<BotStats>('/api/stats', { token });
}

// ─── Health ──────────────────────────────────────────

export interface HealthStatus {
    status: string;
    timestamp: string;
    services: {
        database: { healthy: boolean; latency?: number };
        redis: { healthy: boolean; latency?: number };
        discord: { healthy: boolean; guilds: number };
    };
}

export function getHealth() {
    return apiFetch<HealthStatus>('/api/health');
}

// ─── Creators ────────────────────────────────────────

export interface Creator {
    id: string;
    platform: 'youtube' | 'twitch';
    externalId: string;
    displayName: string;
    iconUrl: string | null;
    isLive: boolean;
    streamTitle: string | null;
    lastStreamId: string | null;
    startedAt: string | null;
    lastCheckedAt: string | null;
    createdAt: string;
}

export function getCreators(token: string) {
    return apiFetch<{ creators: Creator[] }>('/api/creators', { token });
}

export function addCreator(token: string, data: { platform: string; externalId: string; displayName: string; iconUrl?: string }) {
    return apiFetch<{ id: string }>('/api/creators', {
        token,
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export function deleteCreator(token: string, id: string) {
    return apiFetch<{ success: boolean }>(`/api/creators/${id}`, {
        token,
        method: 'DELETE',
    });
}

// ─── Routing ─────────────────────────────────────────

export interface Route {
    id: string;
    creator_id: string;
    guild_id: string;
    channel_id: string;
    channel_name?: string;
    mention_role_id: string | null;
    mention_role_name?: string | null;
    display_name: string;
    platform: string;
}

export function getRouting(token: string, guildId?: string) {
    const query = guildId ? `?guildId=${guildId}` : '';
    return apiFetch<{ routes: Route[] }>(`/api/routing${query}`, { token });
}

export function addRoute(token: string, data: { creatorId: string; guildId: string; channelId: string; mentionRoleId?: string }) {
    return apiFetch<{ id: string }>('/api/routing', {
        token,
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export function deleteRoute(token: string, id: string) {
    return apiFetch<{ success: boolean }>(`/api/routing/${id}`, {
        token,
        method: 'DELETE',
    });
}

// ─── Guilds ──────────────────────────────────────────

export interface Guild {
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
}

export interface Channel {
    id: string;
    name: string;
    type: number;
}

export function getGuilds(token: string) {
    return apiFetch<{ guilds: Guild[] }>('/api/guilds', { token });
}

export function getGuildChannels(token: string, guildId: string) {
    return apiFetch<{ channels: Channel[] }>(`/api/guilds/${guildId}/channels`, { token });
}

// ─── Auth ────────────────────────────────────────────

export function exchangeDiscordCode(code: string, redirectUri: string) {
    return apiFetch<{ token: string; user: { id: string; username: string; globalName: string; avatar: string; avatarUrl: string } }>(
        '/api/auth/discord',
        {
            method: 'POST',
            body: JSON.stringify({ code, redirectUri }),
        }
    );
}
