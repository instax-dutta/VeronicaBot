import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..');

const logger = createLogger('Database');

let db = null;
const statementCache = new Map();

export function initDatabase() {
    if (db) {
        return db;
    }

    const dbPath = config.database.path || resolve(projectRoot, 'veronica.db');
    logger.info(`Connecting to SQLite database: ${dbPath}`);

    try {
        db = new Database(dbPath, { 
            verbose: config.database.verbose || null,
            prepareCacheSize: 100
        });

        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = -64000');
        db.pragma('temp_store = MEMORY');
        db.pragma('foreign_keys = ON');

        runMigrations();

        logger.info('✅ Connected to SQLite database');
        return db;
    } catch (error) {
        logger.error('Failed to connect to SQLite database', { error: error.message });
        throw error;
    }
}

export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

function getPreparedStatement(text) {
    const cacheKey = text;
    if (!statementCache.has(cacheKey)) {
        const stmt = db.prepare(text);
        statementCache.set(cacheKey, stmt);
    }
    return statementCache.get(cacheKey);
}

export function query(text, params = []) {
    const database = getDb();
    const trimmedText = text.trim().toUpperCase();
    const isSelect = trimmedText.startsWith('SELECT') || trimmedText.startsWith('PRAGMA');

    try {
        const stmt = getPreparedStatement(text);
        const result = isSelect 
            ? stmt.all(...params)
            : stmt.run(...params);

        if (isSelect) {
            return { rows: result };
        } else {
            return { 
                rowCount: result.changes, 
                rows: [] 
            };
        }
    } catch (error) {
        logger.error('Query failed', { error: error.message, query: text.substring(0, 100) });
        throw error;
    }
}

export function transaction(callback) {
    const database = getDb();
    return database.transaction(callback)();
}

export function batchInsert(table, columns, rows) {
    if (!rows || rows.length === 0) {
        return { rowCount: 0, rows: [] };
    }

    const database = getDb();
    const columnList = columns.join(', ');
    const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const values = rows.flat();
    const sql = `INSERT INTO ${table} (${columnList}) VALUES ${placeholders}`;

    try {
        const stmt = getPreparedStatement(sql);
        const result = stmt.run(...values);
        return { rowCount: result.changes, rows: [] };
    } catch (error) {
        logger.error('Batch insert failed', { error: error.message, table });
        throw error;
    }
}

function runMigrations() {
    logger.info('Running database migrations...');

    const migrations = [
        `CREATE TABLE IF NOT EXISTS creators (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            external_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            icon_url TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(platform, external_id)
        )`,

        `CREATE TABLE IF NOT EXISTS stream_state (
            creator_id TEXT PRIMARY KEY,
            last_stream_id TEXT,
            is_live INTEGER DEFAULT 0,
            stream_title TEXT,
            started_at TEXT,
            last_checked_at TEXT,
            last_notified_at TEXT,
            consecutive_errors INTEGER DEFAULT 0,
            FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS routing (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            mention_role_id TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(creator_id, guild_id, channel_id),
            FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS notification_log (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            stream_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            sent_at TEXT NOT NULL,
            FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE
        )`,
    ];

    for (const migration of migrations) {
        try {
            query(migration);
        } catch (error) {
            logger.error('Migration failed', { error: error.message, migration: migration.substring(0, 50) });
            throw error;
        }
    }

    createIndexes();

    logger.info('✅ Database migrations completed');
}

function createIndexes() {
    const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_creators_platform ON creators(platform)`,
        `CREATE INDEX IF NOT EXISTS idx_creators_platform_external ON creators(platform, external_id)`,
        `CREATE INDEX IF NOT EXISTS idx_stream_state_is_live ON stream_state(is_live)`,
        `CREATE INDEX IF NOT EXISTS idx_stream_state_last_notified ON stream_state(last_notified_at)`,
        `CREATE INDEX IF NOT EXISTS idx_routing_guild ON routing(guild_id)`,
        `CREATE INDEX IF NOT EXISTS idx_routing_channel ON routing(channel_id)`,
        `CREATE INDEX IF NOT EXISTS idx_notification_log_creator ON notification_log(creator_id)`,
        `CREATE INDEX IF NOT EXISTS idx_notification_log_stream ON notification_log(creator_id, stream_id, channel_id)`,
    ];

    for (const index of indexes) {
        try {
            query(index);
        } catch (error) {
            logger.warn('Index creation failed (may already exist)', { error: error.message, index: index.substring(0, 50) });
        }
    }
}

export function closeDatabase() {
    if (db) {
        logger.info('Closing database connection...');
        statementCache.clear();
        db.close();
        db = null;
        logger.info('✅ Database connection closed');
    }
}

export function checkHealth() {
    try {
        const start = Date.now();
        query('SELECT 1 as health');
        const latency = Date.now() - start;
        return { healthy: true, latency };
    } catch (error) {
        return { healthy: false, error: error.message };
    }
}

export default {
    initDatabase,
    getDb,
    query,
    closeDatabase,
    checkHealth,
    transaction,
    batchInsert,
};
