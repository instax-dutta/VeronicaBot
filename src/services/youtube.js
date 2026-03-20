/**
 * YouTube API service
 * Uses RSS feeds (free) + API verification
 * Detects BOTH live streams AND new video uploads
 * 
 * Made by sdad.pro
 */

import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { youtubeRateLimiter, pauseLimiter } from './rateLimiter.js';

const logger = createLogger('YouTube');

// API base URL
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_RSS_BASE = 'https://www.youtube.com/feeds/videos.xml';

// How long a video is considered "new" (in hours)
const NEW_VIDEO_THRESHOLD_HOURS = 24;

/**
 * Make an authenticated API request to YouTube
 * This consumes API quota - use sparingly!
 */
async function youtubeRequest(endpoint, params = {}) {
    return youtubeRateLimiter.schedule(async () => {
        try {
            const response = await axios.get(`${YOUTUBE_API_BASE}${endpoint}`, {
                params: {
                    ...params,
                    key: config.youtube.apiKey,
                },
            });

            return response.data;
        } catch (error) {
            // Handle specific error codes
            if (error.response?.status === 403) {
                const errorReason = error.response.data?.error?.errors?.[0]?.reason;

                if (errorReason === 'quotaExceeded') {
                    logger.error('YouTube API quota exceeded! Pausing for 1 hour.');
                    pauseLimiter(youtubeRateLimiter, 60 * 60 * 1000, 'Quota exceeded');
                } else if (errorReason === 'rateLimitExceeded') {
                    logger.warn('YouTube rate limit hit, backing off...');
                    pauseLimiter(youtubeRateLimiter, 60 * 1000, 'Rate limit');
                }

                throw error;
            }

            if (error.response?.status === 429) {
                logger.warn('YouTube 429 received, backing off...');
                pauseLimiter(youtubeRateLimiter, 5 * 60 * 1000, 'Too many requests');
                throw error;
            }

            logger.error('YouTube API request failed', {
                endpoint,
                status: error.response?.status,
                error: error.response?.data || error.message,
            });

            throw error;
        }
    });
}

/**
 * Fetch RSS feed for a YouTube channel
 * This is FREE and doesn't consume API quota!
 * @param {string} channelId - YouTube channel ID
 */
export async function fetchChannelRSS(channelId) {
    try {
        const response = await axios.get(YOUTUBE_RSS_BASE, {
            params: { channel_id: channelId },
            timeout: 10000,
        });

        const parsed = await parseStringPromise(response.data, {
            explicitArray: false,
        });

        return parsed.feed?.entry || [];
    } catch (error) {
        // RSS feeds can fail (404 for invalid channels, etc.)
        // This is non-critical, just return empty
        logger.debug(`RSS fetch failed for ${channelId}`, { error: error.message });
        return [];
    }
}

/**
 * Get video details - costs 1 API unit per call (up to 50 videos)
 * @param {string[]} videoIds - Array of video IDs
 */
export async function getVideoDetails(videoIds) {
    if (videoIds.length === 0) return [];
    if (videoIds.length > 50) {
        throw new Error('Cannot request more than 50 videos at once');
    }

    const data = await youtubeRequest('/videos', {
        part: 'snippet,liveStreamingDetails,contentDetails',
        id: videoIds.join(','),
    });

    return data.items || [];
}

/**
 * Resolve a YouTube handle (e.g. @user) to a Channel ID
 * Uses search.list as it's the most reliable way to find a channel by handle/name
 * Cost: 100 quota units
 * @param {string} handle - The handle (e.g. @user)
 */
export async function resolveHandle(handle) {
    logger.debug(`Resolving handle: ${handle}`);
    try {
        const data = await youtubeRequest('/search', {
            part: 'snippet',
            type: 'channel',
            q: handle,
            maxResults: 1,
        });

        if (data.items && data.items.length > 0) {
            const channelId = data.items[0].snippet.channelId;
            logger.debug(`Resolved ${handle} -> ${channelId}`);
            return channelId;
        }
        return null;
    } catch (error) {
        logger.error(`Failed to resolve handle ${handle}`, { error: error.message });
        return null;
    }
}

/**
 * Get channel details (title, icon)
 * Costs 1 quota unit
 * @param {string} channelId 
 */
export async function getChannelDetails(channelId) {
    try {
        const data = await youtubeRequest('/channels', {
            part: 'snippet',
            id: channelId,
        });

        if (data.items && data.items.length > 0) {
            return data.items[0].snippet;
        }
        return null;
    } catch (error) {
        logger.error(`Failed to get channel details for ${channelId}`, { error: error.message });
        return null;
    }
}

/**
 * Parse video entry from RSS feed
 */
function parseRSSEntry(entry) {
    return {
        videoId: entry['yt:videoId'],
        title: entry.title,
        published: entry.published,
        updated: entry.updated,
        channelId: entry['yt:channelId'],
        author: entry.author?.name,
        link: entry.link?.$?.href || `https://www.youtube.com/watch?v=${entry['yt:videoId']}`,
    };
}

/**
 * Check if a video was published recently (within threshold)
 */
function isRecentVideo(publishedDate) {
    const published = new Date(publishedDate);
    const now = new Date();
    const hoursDiff = (now - published) / (1000 * 60 * 60);
    return hoursDiff <= NEW_VIDEO_THRESHOLD_HOURS;
}

/**
 * Efficiently check for live streams AND new videos
 * Strategy:
 * 1. Fetch RSS feeds (free) to get recent videos
 * 2. Filter for recent uploads
 * 3. Use videos.list to check live status AND get video details
 * 
 * @param {Object[]} creators - Array of creator objects with external_id
 */
export async function checkCreatorsLiveStatus(creators) {
    if (creators.length === 0) return [];

    logger.debug(`Checking ${creators.length} YouTube channels...`);

    const results = [];
    const recentVideos = [];
    const channelToCreator = new Map();

    // Step 1: Fetch RSS feeds for all channels (parallel, free)
    const rssPromises = creators.map(async (creator) => {
        channelToCreator.set(creator.external_id, creator);

        try {
            const entries = await fetchChannelRSS(creator.external_id);

            // Get the most recent video only
            const recentEntries = Array.isArray(entries) ? entries.slice(0, 1) : [entries];

            for (const entry of recentEntries) {
                if (entry && entry['yt:videoId']) {
                    const published = entry.published;

                    recentVideos.push({
                        videoId: entry['yt:videoId'],
                        channelId: creator.external_id,
                        title: entry.title,
                        published: published,
                        creatorId: creator.id,
                    });
                }
            }
        } catch (error) {
            // Silently ignore RSS failures
        }
    });

    await Promise.allSettled(rssPromises);

    if (recentVideos.length === 0) {
        logger.debug('No recent videos found via RSS');
        return creators.map(c => ({ ...c, streamData: null, isLive: false, hasNewVideo: false }));
    }

    // Step 2: Batch get video details (1 API unit per 50 videos)
    const uniqueVideoIds = [...new Set(recentVideos.map(v => v.videoId))];

    logger.debug(`Checking ${uniqueVideoIds.length} videos via API`);

    const videoData = new Map(); // channelId -> { isLive, streamData, hasNewVideo, videoData }

    // Process in batches of 50
    for (let i = 0; i < uniqueVideoIds.length; i += 50) {
        const batch = uniqueVideoIds.slice(i, i + 50);

        try {
            const videos = await getVideoDetails(batch);

            for (const video of videos) {
                const channelId = video.snippet.channelId;
                const liveDetails = video.liveStreamingDetails;
                const published = video.snippet.publishedAt;

                // Check if currently live
                const isLive = liveDetails?.actualStartTime && !liveDetails?.actualEndTime;

                if (isLive) {
                    // LIVE STREAM
                    videoData.set(channelId, {
                        type: 'live',
                        isLive: true,
                        hasNewVideo: false,
                        streamData: {
                            videoId: video.id,
                            streamId: video.id,
                            title: video.snippet.title,
                            channelId,
                            channelTitle: video.snippet.channelTitle,
                            startedAt: liveDetails.actualStartTime,
                            viewerCount: parseInt(liveDetails.concurrentViewers || '0', 10),
                            viewers: parseInt(liveDetails.concurrentViewers || '0', 10),
                            thumbnailUrl: video.snippet.thumbnails?.maxres?.url ||
                                video.snippet.thumbnails?.high?.url ||
                                video.snippet.thumbnails?.default?.url,
                            url: `https://www.youtube.com/watch?v=${video.id}`,
                            isLive: true,
                        },
                    });
                } else if (isRecentVideo(published)) {
                    // NEW VIDEO UPLOAD (not currently stored as live)

                    // Fix: Ignore past live streams (VODs) to prevent double notifications
                    // If it has actualEndTime, it was a stream that finished
                    if (liveDetails?.actualEndTime) {
                        continue;
                    }

                    // Only set if we don't already have live data for this channel
                    if (!videoData.has(channelId) || !videoData.get(channelId).isLive) {
                        videoData.set(channelId, {
                            type: 'video',
                            isLive: false,
                            hasNewVideo: true,
                            streamData: {
                                videoId: video.id,
                                streamId: video.id, // Use videoId as unique identifier
                                title: video.snippet.title,
                                channelId,
                                channelTitle: video.snippet.channelTitle,
                                publishedAt: published,
                                thumbnailUrl: video.snippet.thumbnails?.maxres?.url ||
                                    video.snippet.thumbnails?.high?.url ||
                                    video.snippet.thumbnails?.default?.url,
                                url: `https://www.youtube.com/watch?v=${video.id}`,
                                duration: video.contentDetails?.duration,
                                isLive: false,
                                isVideo: true,
                            },
                        });
                    }
                }
            }
        } catch (error) {
            logger.error(`Failed to check video batch`, { error: error.message });
        }
    }

    const liveCount = [...videoData.values()].filter(v => v.isLive).length;
    const videoCount = [...videoData.values()].filter(v => v.hasNewVideo).length;

    logger.debug(`Found ${liveCount} live streams, ${videoCount} new videos`);

    // Step 3: Map results back to creators
    return creators.map(creator => {
        const data = videoData.get(creator.external_id);
        return {
            ...creator,
            streamData: data?.streamData || null,
            isLive: data?.isLive || false,
            hasNewVideo: data?.hasNewVideo || false,
        };
    });
}

/**
 * Get video/stream URL
 */
export function getStreamUrl(videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Verify the YouTube API key is valid
 */
export async function verifyCredentials() {
    try {
        // Make a minimal API call to verify the key
        await youtubeRequest('/videos', {
            part: 'id',
            id: 'dQw4w9WgXcQ', // Never gonna give you up (always exists)
        });

        logger.info('✅ YouTube credentials verified');
        return true;
    } catch (error) {
        logger.error('❌ YouTube credentials invalid', { error: error.message });
        return false;
    }
}

/**
 * Estimate daily quota usage based on current creator count
 */
export function estimateQuotaUsage(creatorCount, pollsPerDay = 720) {
    // RSS is free, only videos.list costs quota
    // videos.list: 1 unit per call (up to 50 videos)
    const videosPerPoll = creatorCount; // 1 video per channel now
    const apiCallsPerPoll = Math.ceil(videosPerPoll / 50);
    const dailyCost = apiCallsPerPoll * pollsPerDay;

    return {
        pollsPerDay,
        apiCallsPerPoll,
        dailyCost,
        remainingQuota: 10000 - dailyCost,
        withinQuota: dailyCost < 10000,
    };
}

export default {
    getVideoDetails,
    fetchChannelRSS,
    checkCreatorsLiveStatus,
    getStreamUrl,
    verifyCredentials,
    estimateQuotaUsage,
    resolveHandle,
    getChannelDetails,
};
