/**
 * Database Queries
 * 
 * Adapted for SQLite (better-sqlite3).
 * Note: better-sqlite3 is synchronous, but we keep async interface for compatibility.
 */

import crypto from 'crypto';
import { query, transaction } from './index.js';
import { createLogger } from '../utils/logger.js';

const COUNT_CACHE_TTL = 30000;
let countsCache = null;
let countsCacheTime = 0;

const logger = createLogger('Queries');

/**
 * Creator queries
 */
export const creators = {
  /**
   * Insert or update a creator
   * @returns {Promise<string>} Creator ID
   */
  async upsert(platform, externalId, displayName, iconUrl = null) {
    let queryText;
    let params;

    if (iconUrl) {
      queryText = `INSERT INTO creators (platform, external_id, display_name, icon_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (platform, external_id)
       DO UPDATE SET display_name = EXCLUDED.display_name, icon_url = EXCLUDED.icon_url
       RETURNING id`;
      params = [platform, externalId, displayName, iconUrl];
    } else {
      queryText = `INSERT INTO creators (platform, external_id, display_name)
       VALUES (?, ?, ?)
       ON CONFLICT (platform, external_id)
       DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`;
      params = [platform, externalId, displayName];
    }

    const result = await query(queryText, params);
    return result.rows[0]?.id;
  },

  /**
   * Get a creator by platform and external ID
   */
  async getByExternalId(platform, externalId) {
    const result = await query(
      `SELECT * FROM creators WHERE platform = ? AND external_id = ?`,
      [platform, externalId]
    );
    return result.rows[0];
  },

  /**
   * Get a creator by ID
   */
  async getById(id) {
    const result = await query(
      `SELECT * FROM creators WHERE id = ?`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Get all creators for a platform with stream state
   */
  async getAllByPlatform(platform) {
    const result = await query(
      `SELECT c.*, ss.is_live, ss.last_stream_id, ss.stream_title, ss.started_at, ss.last_checked_at, ss.last_notified_at
       FROM creators c
       LEFT JOIN stream_state ss ON c.id = ss.creator_id
       WHERE c.platform = ?
       ORDER BY c.display_name`,
      [platform]
    );
    return result.rows;
  },

  /**
   * Get counts by platform
   */
  async getCounts() {
    const now = Date.now();
    if (countsCache && (now - countsCacheTime) < COUNT_CACHE_TTL) {
      return countsCache;
    }

    const result = await query(
      `SELECT 
        platform,
        COUNT(*) as total,
        SUM(CASE WHEN ss.is_live = 1 THEN 1 ELSE 0 END) as live
       FROM creators c
       LEFT JOIN stream_state ss ON c.id = ss.creator_id
       GROUP BY platform`
    );
    countsCache = result.rows;
    countsCacheTime = now;
    return result.rows;
  },

  clearCountsCache() {
    countsCache = null;
    countsCacheTime = 0;
  },

  /**
   * Delete a creator
   */
  async delete(creatorId) {
    const result = await query(
      `DELETE FROM creators WHERE id = ? RETURNING id`,
      [creatorId]
    );
    return result.rowCount > 0;
  },
};

/**
 * Stream state queries
 */
export const streamState = {
  /**
   * Ensure stream state exists for a creator
   */
  async ensureExists(creatorId) {
    await query(
      `INSERT OR IGNORE INTO stream_state (creator_id)
       VALUES (?)`,
      [creatorId]
    );
  },

  /**
   * Update stream state
   */
  async update(creatorId, { isLive, streamId, streamTitle, startedAt }) {
    const result = await query(
      `UPDATE stream_state 
       SET 
         is_live = COALESCE(?, is_live),
         last_stream_id = COALESCE(?, last_stream_id),
         stream_title = COALESCE(?, stream_title),
         started_at = COALESCE(?, started_at),
         last_checked_at = datetime('now'),
         consecutive_errors = 0
       WHERE creator_id = ?
       RETURNING *`,
      [isLive, streamId, streamTitle, startedAt, creatorId]
    );
    return result.rows[0];
  },

  /**
   * Mark as checked
   */
  async markChecked(creatorId) {
    await query(
      `UPDATE stream_state SET last_checked_at = datetime('now') WHERE creator_id = ?`,
      [creatorId]
    );
  },

  /**
   * Mark as notified
   */
  async markNotified(creatorId) {
    await query(
      `UPDATE stream_state SET last_notified_at = datetime('now') WHERE creator_id = ?`,
      [creatorId]
    );
  },

  /**
   * Get stream state for a creator
   */
  async get(creatorId) {
    const result = await query(
      `SELECT * FROM stream_state WHERE creator_id = ?`,
      [creatorId]
    );
    return result.rows[0];
  },

  /**
   * Set offline
   */
  async setOffline(creatorId) {
    await query(
      `UPDATE stream_state 
       SET is_live = 0, stream_title = NULL, started_at = NULL, last_checked_at = datetime('now')
       WHERE creator_id = ?`,
      [creatorId]
    );
  },

  /**
   * Increment error count
   */
  async incrementError(creatorId) {
    await query(
      `UPDATE stream_state 
       SET consecutive_errors = consecutive_errors + 1 
       WHERE creator_id = ?`,
      [creatorId]
    );
  },

  /**
   * Check if we should notify (stream ID is different)
   */
  async shouldNotify(creatorId, streamId) {
    const result = await query(
      `SELECT id FROM stream_state 
       WHERE creator_id = ? 
       AND (last_stream_id IS NULL OR last_stream_id != ?)`,
      [creatorId, streamId]
    );
    return result.rowCount > 0;
  },
};

/**
 * Routing queries
 */
export const routing = {
  /**
   * Add a routing rule
   */
  async add(creatorId, guildId, channelId, mentionRoleId = null) {
    const result = await query(
      `INSERT OR IGNORE INTO routing (creator_id, guild_id, channel_id, mention_role_id)
       VALUES (?, ?, ?, ?)
       RETURNING id`,
      [creatorId, guildId, channelId, mentionRoleId]
    );
    return result.rows[0]?.id;
  },

  /**
   * Get all routing rules for a creator
   */
  async getForCreator(creatorId) {
    const result = await query(
      `SELECT * FROM routing WHERE creator_id = ?`,
      [creatorId]
    );
    return result.rows;
  },

  /**
   * Get all routing rules for a guild
   */
  async getForGuild(guildId) {
    const result = await query(
      `SELECT r.*, c.platform, c.external_id, c.display_name
       FROM routing r
       JOIN creators c ON r.creator_id = c.id
       WHERE r.guild_id = ?`,
      [guildId]
    );
    return result.rows;
  },

  /**
   * Delete a routing rule
   */
  async delete(routingId) {
    const result = await query(
      `DELETE FROM routing WHERE id = ? RETURNING id`,
      [routingId]
    );
    return result.rowCount > 0;
  },

  /**
   * Delete all routing rules for a creator
   */
  async deleteForCreator(creatorId) {
    const result = await query(
      `DELETE FROM routing WHERE creator_id = ?`,
      [creatorId]
    );
    return result.rowCount;
  },
};

/**
 * Notification log queries
 */
export const notificationLog = {
  /**
   * Log a notification
   */
  async add(creatorId, streamId, guildId, channelId, messageId = null) {
    await query(
      `INSERT INTO notification_log (creator_id, stream_id, guild_id, channel_id, message_id)
       VALUES (?, ?, ?, ?, ?)`,
      [creatorId, streamId, guildId, channelId, messageId]
    );
  },

  /**
   * Find an existing notification for the same display_name on a different platform
   * Used for cross-platform merging (edit instead of sending a second notification)
   */
  async findCrossPlatform(displayName, channelId, currentPlatform) {
    const result = await query(
      `SELECT nl.message_id, nl.stream_id, c.platform, c.id as creator_id, c.external_id, c.display_name, c.icon_url,
              ss.stream_title, ss.started_at, ss.last_stream_id
       FROM notification_log nl
       JOIN creators c ON nl.creator_id = c.id
       LEFT JOIN stream_state ss ON c.id = ss.creator_id
       WHERE LOWER(c.display_name) = LOWER(?)
         AND nl.channel_id = ?
         AND c.platform != ?
         AND nl.message_id IS NOT NULL
         AND ss.is_live = 1
         AND nl.sent_at > datetime('now', '-24 hours')
       ORDER BY nl.sent_at DESC
       LIMIT 1`,
      [displayName, channelId, currentPlatform]
    );
    return result.rows[0] || null;
  },

  /**
   * Check if notification already sent
   */
  async exists(creatorId, streamId, channelId) {
    const result = await query(
      `SELECT id FROM notification_log 
       WHERE creator_id = ? AND stream_id = ? AND channel_id = ?`,
      [creatorId, streamId, channelId]
    );
    return result.rowCount > 0;
  },

  /**
   * Get notification count
   */
  async getCount() {
    const result = await query(`SELECT COUNT(*) as count FROM notification_log`);
    return parseInt(result.rows[0].count, 10);
  },

  /**
   * Cleanup old notifications
   */
  async cleanup() {
    const result = await query(
      `DELETE FROM notification_log WHERE sent_at < datetime('now', '-30 days')`
    );
    if (result.rowCount > 0) {
      logger.info(`Cleaned up ${result.rowCount} old notification logs`);
    }
    return result.rowCount;
  },
};

/**
 * Bulk import creators
 */
export async function bulkImportCreators(creatorsData) {
  return transaction(() => {
    let imported = 0;
    
    for (const item of creatorsData) {
      try {
        const creatorId = crypto.randomUUID();
        query(
          `INSERT OR REPLACE INTO creators (id, platform, external_id, display_name, icon_url, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          [creatorId, item.platform, item.externalId, item.displayName, item.iconUrl || null]
        );
        
        query(
          `INSERT OR IGNORE INTO stream_state (creator_id) VALUES (?)`,
          [creatorId]
        );
        
        query(
          `INSERT OR IGNORE INTO routing (id, creator_id, guild_id, channel_id, mention_role_id, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          [crypto.randomUUID(), creatorId, item.guildId, item.channelId, item.mentionRoleId || null]
        );
        
        imported++;
      } catch (error) {
        logger.error(`Failed to import creator ${item.displayName}`, { error: error.message });
      }
    }
    
    return imported;
  });
}

export default {
  creators,
  streamState,
  routing,
  notificationLog,
  bulkImportCreators,
};
