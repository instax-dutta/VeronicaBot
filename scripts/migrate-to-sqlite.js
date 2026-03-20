import pg from 'pg';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initDatabase, closeDatabase } from '../src/database/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const { Pool } = pg;

const POSTGRESQL_CONNECTION_STRING = 'postgresql://neondb_owner:npg_BtpFTOXz5d2r@ep-patient-boat-a1102wtb-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const SQLITE_DB_PATH = resolve(projectRoot, 'data', 'veronica.db');

const TABLES = ['creators', 'stream_state', 'routing', 'notification_log'];

async function migrate() {
    let pgPool = null;
    let sqliteDb = null;

    try {
        console.log('🚀 Starting migration from PostgreSQL to SQLite...\n');

        console.log('📡 Connecting to PostgreSQL (NeonDB)...');
        pgPool = new Pool({
            connectionString: POSTGRESQL_CONNECTION_STRING,
            ssl: {
                rejectUnauthorized: false
            }
        });
        await pgPool.query('SELECT 1');
        console.log('✅ Connected to PostgreSQL\n');

        console.log('📦 Initializing SQLite database (running migrations)...');
        sqliteDb = initDatabase();
        console.log('✅ SQLite database initialized\n');

        console.log('🧹 Clearing existing data from SQLite tables...');
        for (const tableName of TABLES) {
            sqliteDb.prepare(`DELETE FROM ${tableName}`).run();
        }
        console.log('✅ Existing data cleared\n');

        for (const tableName of TABLES) {
            console.log(`📋 Migrating table: ${tableName}...`);

            const pgResult = await pgPool.query(`SELECT * FROM ${tableName}`);
            const rows = pgResult.rows;
            console.log(`   - Found ${rows.length} records in PostgreSQL`);

            if (rows.length === 0) {
                console.log(`   - No records to migrate, skipping...\n`);
                continue;
            }

            const columns = Object.keys(rows[0]);
            const columnList = columns.join(', ');
            const placeholders = columns.map(() => '?').join(', ');
            const insertSql = `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`;

            const insertStmt = sqliteDb.prepare(insertSql);

            const insertTransaction = sqliteDb.transaction((data) => {
                for (const row of data) {
                    const values = columns.map(col => {
                        const val = row[col];
                        if (val === null || val === undefined) {
                            return null;
                        }
                        if (typeof val === 'boolean') {
                            return val ? 1 : 0;
                        }
                        if (val instanceof Date) {
                            return val.toISOString();
                        }
                        if (typeof val === 'bigint') {
                            return val.toString();
                        }
                        if (val && typeof val === 'object' && !(val instanceof Buffer)) {
                            return JSON.stringify(val);
                        }
                        return val;
                    });
                    insertStmt.run(...values);
                }
            });

            insertTransaction(rows);
            console.log(`   - ✅ Inserted ${rows.length} records into SQLite\n`);
        }

        console.log('🎉 Migration completed successfully!');

        console.log('\n📊 Migration Summary:');
        for (const tableName of TABLES) {
            const countResult = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
            console.log(`   - ${tableName}: ${countResult.count} records`);
        }

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        if (pgPool) {
            await pgPool.end();
            console.log('\n🔌 PostgreSQL connection closed');
        }
        if (sqliteDb) {
            closeDatabase();
            console.log('🔌 SQLite connection closed');
        }
    }
}

migrate();
